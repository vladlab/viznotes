import { reactive, ref, computed, toRaw, nextTick } from 'vue'
import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'
import type { AnchorSide } from '../types/arrow'
import type { Page, PageSummary } from '../types/page'
import { createDefaultNote } from '../types/note'
import { createDefaultArrow } from '../types/arrow'
import { createDefaultPage } from '../types/page'
import type { StorageBackend } from '../storage/interface'
import { history } from './history'

let storage: StorageBackend

function setStorage(backend: StorageBackend) {
  storage = backend
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(toRaw(obj)))
}

// ── Reactive state ──

const currentPageId = ref<string | null>(null)
const currentPage = ref<Page | null>(null)
const notes = reactive<Map<string, Note>>(new Map())
const arrows = reactive<Map<string, Arrow>>(new Map())
const pageList = ref<PageSummary[]>([])
const pageHistory = ref<string[]>([])
const loading = ref(false)

// Bumped on every drag frame to force arrow recomputation
const dragTick = ref(0)

// Direct callback for arrow recomputation — set by ArrowLayer
let arrowRecomputeCallback: (() => void) | null = null

function setArrowRecompute(fn: () => void) {
  arrowRecomputeCallback = fn
}

function triggerArrowRecompute() {
  dragTick.value++
  // nextTick ensures Vue has flushed DOM, rAF ensures browser has laid out
  nextTick(() => {
    requestAnimationFrame(() => {
      if (arrowRecomputeCallback) arrowRecomputeCallback()
    })
  })
}

// Selection & editing
const selectedNoteIds = reactive(new Set<string>())
const selectedArrowIds = reactive(new Set<string>())
const editingNoteId = ref<string | null>(null)

// Snapshot of note being edited (captured on edit start, used to build undo on edit end)
let editStartSnapshot: Note | null = null

// ── Computed ──

const rootNotes = computed(() => {
  if (!currentPage.value) return []
  return currentPage.value.rootNoteIds
    .map(id => notes.get(id))
    .filter((n): n is Note => n !== undefined)
})

const selectedNotes = computed(() => {
  return Array.from(selectedNoteIds)
    .map(id => notes.get(id))
    .filter((n): n is Note => n !== undefined)
})

// ── Internal helpers ──

function getRootIds(): string[] {
  return currentPage.value ? [...currentPage.value.rootNoteIds] : []
}

function selectionArray(): string[] {
  return Array.from(selectedNoteIds)
}

async function persistNote(note: Note) {
  note.updatedAt = Date.now()
  await storage.saveNote(note)
}

async function persistPage() {
  if (currentPage.value) {
    currentPage.value.updatedAt = Date.now()
    await storage.savePage(currentPage.value)
  }
}

// ── History integration ──

// Called by history module to apply undo/redo snapshots
history.setApplySnapshot(async (action, direction) => {
  const noteSnaps = direction === 'undo' ? action.notesBefore : action.notesAfter
  const arrowSnaps = direction === 'undo' ? action.arrowsBefore : action.arrowsAfter
  const rootIds = direction === 'undo' ? action.rootIdsBefore : action.rootIdsAfter
  const selection = direction === 'undo' ? action.selectionBefore : action.selectionAfter
  const arrowSel = direction === 'undo' ? action.arrowSelectionBefore : action.arrowSelectionAfter

  // Apply note snapshots
  for (const [id, snapshot] of Object.entries(noteSnaps)) {
    if (snapshot === null) {
      notes.delete(id)
      await storage.deleteNotes([id])
    } else {
      const restored = deepClone(snapshot)
      notes.set(id, restored)
      await persistNote(restored)
    }
  }

  // Apply arrow snapshots
  for (const [id, snapshot] of Object.entries(arrowSnaps)) {
    if (snapshot === null) {
      arrows.delete(id)
      await storage.deleteArrow(id)
    } else {
      const restored = deepClone(snapshot)
      arrows.set(id, restored)
      await storage.saveArrow(restored)
    }
  }

  // Apply root IDs
  if (rootIds !== null && currentPage.value) {
    currentPage.value.rootNoteIds = [...rootIds]
    await persistPage()
  }

  // Restore selection
  selectedNoteIds.clear()
  selectedArrowIds.clear()
  for (const id of selection) {
    if (notes.has(id)) selectedNoteIds.add(id)
  }
  for (const id of arrowSel) {
    if (arrows.has(id)) selectedArrowIds.add(id)
  }
  editingNoteId.value = null
})

// ── Selection ──

function selectNote(noteId: string, additive = false) {
  if (!additive) {
    selectedNoteIds.clear()
    selectedArrowIds.clear()
  }
  selectedNoteIds.add(noteId)
  const note = notes.get(noteId)
  if (note) bringToTop(note)
}

function toggleNoteSelection(noteId: string) {
  if (selectedNoteIds.has(noteId)) {
    selectedNoteIds.delete(noteId)
  } else {
    selectedNoteIds.add(noteId)
    const note = notes.get(noteId)
    if (note) bringToTop(note)
  }
}

function selectArrow(arrowId: string, additive = false) {
  if (!additive) {
    selectedNoteIds.clear()
    selectedArrowIds.clear()
  }
  selectedArrowIds.add(arrowId)
}

function clearSelection() {
  selectedNoteIds.clear()
  selectedArrowIds.clear()
}

function isSelected(noteId: string): boolean {
  return selectedNoteIds.has(noteId)
}

// ── Editing ──

function setEditingNote(noteId: string) {
  // If switching from another note, finalize that edit first
  if (editingNoteId.value && editingNoteId.value !== noteId) {
    finalizeEdit()
  }

  // Snapshot the note before editing starts
  editStartSnapshot = history.snapshotNote(notes, noteId)
  editingNoteId.value = noteId

  if (!selectedNoteIds.has(noteId)) {
    selectedNoteIds.clear()
    selectedNoteIds.add(noteId)
  }
}

function clearEditing() {
  if (editingNoteId.value) {
    finalizeEdit()
  }
  editingNoteId.value = null
}

/** Compare edit start snapshot to current state; push undo action if changed */
function finalizeEdit() {
  if (!editStartSnapshot || !editingNoteId.value) {
    editStartSnapshot = null
    return
  }

  const noteId = editingNoteId.value
  const currentNote = notes.get(noteId)
  if (!currentNote) {
    editStartSnapshot = null
    return
  }

  const beforeJson = JSON.stringify(toRaw(editStartSnapshot))
  const afterJson = JSON.stringify(toRaw(currentNote))

  if (beforeJson !== afterJson) {
    history.pushAction({
      description: 'Edit note',
      notesBefore: { [noteId]: editStartSnapshot },
      notesAfter: { [noteId]: deepClone(currentNote) },
      rootIdsBefore: null,
      rootIdsAfter: null,
      selectionBefore: [noteId],
      selectionAfter: [noteId],
    })
  }

  editStartSnapshot = null
}

// ── Page management ──

async function loadPageList() {
  pageList.value = await storage.listPages()
}

async function loadPage(pageId: string) {
  // Flush any pending saves from the current page before switching
  await flushPendingSaves()

  loading.value = true
  editingNoteId.value = null
  editStartSnapshot = null
  selectedNoteIds.clear()
  history.clear()

  try {
    const page = await storage.getPage(pageId)
    if (!page) return

    const pageNotes = await storage.getNotesForPage(pageId)
    const pageArrows = await storage.getArrowsForPage(pageId)
    notes.clear()
    arrows.clear()
    for (const note of pageNotes) {
      notes.set(note.id, note)
    }
    for (const arrow of pageArrows) {
      arrows.set(arrow.id, arrow)
    }

    currentPage.value = page
    currentPageId.value = pageId
  } finally {
    loading.value = false
  }
}

async function createPage(title: string = 'Untitled'): Promise<Page> {
  const page = await storage.savePage(createDefaultPage({ title }))
  await loadPageList()
  return page
}

async function navigateToPage(pageId: string, pushHistory = true) {
  if (pushHistory && currentPageId.value) {
    pageHistory.value.push(currentPageId.value)
  } else if (!pushHistory) {
    pageHistory.value = []
  }
  await loadPage(pageId)
}

async function navigateBack() {
  const prevId = pageHistory.value.pop()
  if (prevId) await loadPage(prevId)
}

// ── Note CRUD ──

async function createNote(
  pos: { x: number; y: number },
  parentNoteId?: string,
  options?: {
    initialText?: string;
    startEditing?: boolean;
    bodyText?: string;
    collapsed?: boolean;
    link?: string;
    nodeType?: string;
  }
): Promise<Note> {
  if (!currentPage.value) throw new Error('No page loaded')

  const selBefore = selectionArray()
  const rootIdsBefore = getRootIds()

  // Snapshot parent before
  const parentBefore = parentNoteId ? history.snapshotNote(notes, parentNoteId) : null

  const note = createDefaultNote(currentPage.value.id, pos)
  note.zIndex = currentPage.value.nextZIndex++

  // Set initial text in head section
  if (options?.initialText) {
    note.head.content = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: options.initialText }]
      }]
    }
  }

  // Set body text
  if (options?.bodyText) {
    note.body.enabled = true
    note.body.content = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: options.bodyText }]
      }]
    }
  }

  // Set collapsed state
  if (options?.collapsed !== undefined) {
    note.collapsed = options.collapsed
  }

  // Set link
  if (options?.link) {
    note.link = options.link
  }

  // Set node type
  if (options?.nodeType) {
    note.nodeType = options.nodeType
  }

  const saved = await storage.saveNote(note)
  notes.set(saved.id, saved)

  if (parentNoteId) {
    const parent = notes.get(parentNoteId)
    if (parent) {
      parent.container.childIds.push(saved.id)
      await persistNote(parent)
    }
  } else {
    currentPage.value.rootNoteIds.push(saved.id)
    await persistPage()
  }

  // Select and optionally edit the new note
  selectedNoteIds.clear()
  selectedArrowIds.clear()
  selectedNoteIds.add(saved.id)

  const shouldEdit = options?.startEditing !== false
  if (shouldEdit) {
    editingNoteId.value = saved.id
    editStartSnapshot = deepClone(saved)
  }

  // Build undo action
  const notesBefore: Record<string, Note | null> = { [saved.id]: null }
  const notesAfter: Record<string, Note | null> = { [saved.id]: deepClone(saved) }

  if (parentNoteId) {
    notesBefore[parentNoteId] = parentBefore
    notesAfter[parentNoteId] = history.snapshotNote(notes, parentNoteId)
  }

  history.pushAction({
    description: 'Create note',
    notesBefore,
    notesAfter,
    rootIdsBefore: parentNoteId ? null : rootIdsBefore,
    rootIdsAfter: parentNoteId ? null : getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [saved.id],
  })

  return saved
}

async function updateNote(note: Note) {
  note.updatedAt = Date.now()
  notes.set(note.id, note)
  await storage.saveNote(note)
  if (currentPage.value) {
    currentPage.value.updatedAt = Date.now()
    await storage.savePage(currentPage.value)
  }
}

// ── Batched save system ──

const dirtyNoteIds = new Set<string>()
const dirtyPage = ref(false)
const hasPendingSaves = ref(false)
let _saveBatchTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(delay = 300) {
  hasPendingSaves.value = true
  if (_saveBatchTimer) clearTimeout(_saveBatchTimer)
  _saveBatchTimer = setTimeout(() => flushPendingSaves(), delay)
}

function markNoteDirty(note: Note, delay = 300) {
  dirtyNoteIds.add(note.id)
  scheduleSave(delay)
}

function markPageDirty(delay = 300) {
  dirtyPage.value = true
  scheduleSave(delay)
}

async function flushPendingSaves() {
  if (_saveBatchTimer) { clearTimeout(_saveBatchTimer); _saveBatchTimer = null }

  // Flush dirty notes
  if (dirtyNoteIds.size > 0) {
    const notesToSave: Note[] = []
    for (const id of dirtyNoteIds) {
      const note = notes.get(id)
      if (note) {
        note.updatedAt = Date.now()
        notesToSave.push(toRaw(note))
      }
    }
    dirtyNoteIds.clear()
    if (notesToSave.length > 0) {
      await storage.saveNotes(notesToSave)
    }
  }

  // Flush dirty page
  if (dirtyPage.value && currentPage.value) {
    currentPage.value.updatedAt = Date.now()
    await storage.savePage(toRaw(currentPage.value))
    dirtyPage.value = false
  }

  hasPendingSaves.value = false
}

/**
 * Record a move action for notes that were dragged.
 * Call this AFTER the drag completes with before/after positions.
 */
function pushMoveAction(movedNotes: Array<{ id: string; before: Note; after: Note }>) {
  if (movedNotes.length === 0) return

  const notesBefore: Record<string, Note | null> = {}
  const notesAfter: Record<string, Note | null> = {}
  const sel = movedNotes.map(m => m.id)

  for (const m of movedNotes) {
    notesBefore[m.id] = m.before
    notesAfter[m.id] = m.after
  }

  history.pushAction({
    description: 'Move note' + (movedNotes.length > 1 ? 's' : ''),
    notesBefore,
    notesAfter,
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: sel,
    selectionAfter: sel,
  })
}

/**
 * Record a resize action.
 */
function pushResizeAction(noteId: string, before: Note, after: Note) {
  history.pushAction({
    description: 'Resize note',
    notesBefore: { [noteId]: before },
    notesAfter: { [noteId]: after },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: [noteId],
    selectionAfter: [noteId],
  })
}

async function deleteNote(noteId: string, parentNoteId?: string) {
  if (!currentPage.value) return

  const selBefore = selectionArray()
  const arrowSelBefore = Array.from(selectedArrowIds)
  const rootIdsBefore = getRootIds()

  // Snapshot all notes that will be deleted (including descendants)
  const allIds = history.collectDescendantIds(notes, noteId)
  const notesBefore = history.snapshotNotes(notes, allIds)
  const notesAfter: Record<string, Note | null> = {}
  for (const id of allIds) notesAfter[id] = null

  // Collect arrows connected to any deleted note
  const arrowsToDelete: string[] = []
  const arrowsBefore: Record<string, Arrow | null> = {}
  const arrowsAfterMap: Record<string, Arrow | null> = {}
  for (const arrow of arrows.values()) {
    if (allIds.includes(arrow.sourceNoteId) || allIds.includes(arrow.targetNoteId)) {
      arrowsToDelete.push(arrow.id)
      arrowsBefore[arrow.id] = deepClone(arrow)
      arrowsAfterMap[arrow.id] = null
    }
  }

  // Snapshot parent
  if (parentNoteId) {
    notesBefore[parentNoteId] = history.snapshotNote(notes, parentNoteId)
  }

  // Perform delete
  editingNoteId.value = null
  editStartSnapshot = null

  if (parentNoteId) {
    const parent = notes.get(parentNoteId)
    if (parent) {
      parent.container.childIds = parent.container.childIds.filter(id => id !== noteId)
      await persistNote(parent)
    }
  } else {
    currentPage.value.rootNoteIds = currentPage.value.rootNoteIds.filter(id => id !== noteId)
    await persistPage()
  }

  for (const id of allIds) {
    notes.delete(id)
    selectedNoteIds.delete(id)
  }
  await storage.deleteNotes(allIds)

  // Delete connected arrows
  for (const aid of arrowsToDelete) {
    arrows.delete(aid)
    selectedArrowIds.delete(aid)
  }
  if (arrowsToDelete.length > 0) {
    await storage.deleteArrows(arrowsToDelete)
  }

  // Snapshot parent after
  if (parentNoteId) {
    notesAfter[parentNoteId] = history.snapshotNote(notes, parentNoteId)
  }

  history.pushAction({
    description: 'Delete note',
    notesBefore,
    notesAfter,
    arrowsBefore,
    arrowsAfter: arrowsAfterMap,
    rootIdsBefore: parentNoteId ? null : rootIdsBefore,
    rootIdsAfter: parentNoteId ? null : getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [],
    arrowSelectionBefore: arrowSelBefore,
    arrowSelectionAfter: [],
  })
}

async function deleteSelected() {
  if (selectedNoteIds.size === 0) return
  if (!currentPage.value) return

  const selBefore = selectionArray()
  const arrowSelBefore = Array.from(selectedArrowIds)
  const rootIdsBefore = getRootIds()

  // Collect ALL notes to delete and their parents
  const allDeleteIds: string[] = []
  const parentSnapshots: Record<string, Note | null> = {}

  const ids = Array.from(selectedNoteIds)

  for (const noteId of ids) {
    if (!notes.has(noteId)) continue
    const descendantIds = history.collectDescendantIds(notes, noteId)
    allDeleteIds.push(...descendantIds)

    const parentId = findParent(noteId)
    if (parentId && !parentSnapshots[parentId]) {
      parentSnapshots[parentId] = history.snapshotNote(notes, parentId)
    }
  }

  const uniqueDeleteIds = [...new Set(allDeleteIds)]

  // Snapshot notes before
  const notesBefore: Record<string, Note | null> = {
    ...history.snapshotNotes(notes, uniqueDeleteIds),
    ...parentSnapshots,
  }
  const notesAfter: Record<string, Note | null> = {}
  for (const id of uniqueDeleteIds) notesAfter[id] = null

  // Collect arrows connected to deleted notes
  const arrowsToDelete: string[] = []
  const arrowsBefore: Record<string, Arrow | null> = {}
  const arrowsAfterMap: Record<string, Arrow | null> = {}
  for (const arrow of arrows.values()) {
    if (uniqueDeleteIds.includes(arrow.sourceNoteId) || uniqueDeleteIds.includes(arrow.targetNoteId)) {
      arrowsToDelete.push(arrow.id)
      arrowsBefore[arrow.id] = deepClone(arrow)
      arrowsAfterMap[arrow.id] = null
    }
  }

  // Perform deletions
  editingNoteId.value = null
  editStartSnapshot = null

  for (const noteId of ids) {
    if (!notes.has(noteId)) continue
    const parentId = findParent(noteId)

    if (parentId) {
      const parent = notes.get(parentId)
      if (parent) {
        parent.container.childIds = parent.container.childIds.filter(id => id !== noteId)
        await persistNote(parent)
      }
    } else {
      currentPage.value!.rootNoteIds = currentPage.value!.rootNoteIds.filter(id => id !== noteId)
    }

    const descendantIds = history.collectDescendantIds(notes, noteId)
    for (const id of descendantIds) {
      notes.delete(id)
      selectedNoteIds.delete(id)
    }
    await storage.deleteNotes(descendantIds)
  }

  // Delete connected arrows
  for (const aid of arrowsToDelete) {
    arrows.delete(aid)
    selectedArrowIds.delete(aid)
  }
  if (arrowsToDelete.length > 0) await storage.deleteArrows(arrowsToDelete)

  await persistPage()

  // Snapshot parents after
  for (const parentId of Object.keys(parentSnapshots)) {
    notesAfter[parentId] = history.snapshotNote(notes, parentId)
  }

  history.pushAction({
    description: 'Delete notes',
    notesBefore,
    notesAfter,
    arrowsBefore: arrowsBefore,
    arrowsAfter: arrowsAfterMap,
    rootIdsBefore,
    rootIdsAfter: getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [],
    arrowSelectionBefore: arrowSelBefore,
    arrowSelectionAfter: [],
  })
}

/** Delete all currently selected notes AND arrows */
async function deleteAllSelected() {
  // Delete selected arrows first
  if (selectedArrowIds.size > 0) {
    await deleteSelectedArrows()
  }
  // Then delete selected notes (which also cleans up their arrows)
  if (selectedNoteIds.size > 0) {
    await deleteSelected()
  }
}

function bringToTop(note: Note) {
  if (!currentPage.value) return
  note.zIndex = currentPage.value.nextZIndex++
  markNoteDirty(note)
  markPageDirty()
}

// ── Reparenting ──

async function reparentNote(noteId: string, oldParentNoteId: string | undefined, newParentNoteId: string) {
  if (!currentPage.value) return
  const note = notes.get(noteId)
  if (!note) return

  const selBefore = selectionArray()
  const rootIdsBefore = getRootIds()

  // Snapshot before
  const affectedIds = [noteId]
  if (oldParentNoteId) affectedIds.push(oldParentNoteId)
  affectedIds.push(newParentNoteId)
  const notesBefore = history.snapshotNotes(notes, [...new Set(affectedIds)])

  // Perform reparent
  if (oldParentNoteId) {
    const oldParent = notes.get(oldParentNoteId)
    if (oldParent) {
      oldParent.container.childIds = oldParent.container.childIds.filter(id => id !== noteId)
      await persistNote(oldParent)
    }
  } else {
    currentPage.value.rootNoteIds = currentPage.value.rootNoteIds.filter(id => id !== noteId)
    await persistPage()
  }

  const newParent = notes.get(newParentNoteId)
  if (newParent) {
    if (!newParent.container.enabled) newParent.container.enabled = true
    newParent.container.childIds.push(noteId)
    if (!newParent.container.spatial) {
      note.pos = { x: 0, y: 0 }
      note.width = 'auto'
      note.height = 'auto'
    }
    await persistNote(newParent)
    await persistNote(note)
  }

  const notesAfter = history.snapshotNotes(notes, [...new Set(affectedIds)])

  history.pushAction({
    description: 'Move note to container',
    notesBefore,
    notesAfter,
    rootIdsBefore: oldParentNoteId ? null : rootIdsBefore,
    rootIdsAfter: oldParentNoteId ? null : getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [noteId],
  })
}

async function unparentNote(noteId: string, parentNoteId: string, worldPos: { x: number; y: number }) {
  if (!currentPage.value) return
  const note = notes.get(noteId)
  if (!note) return

  const selBefore = selectionArray()
  const rootIdsBefore = getRootIds()
  const notesBefore = history.snapshotNotes(notes, [noteId, parentNoteId])

  // Perform unparent
  const parent = notes.get(parentNoteId)
  if (parent) {
    parent.container.childIds = parent.container.childIds.filter(id => id !== noteId)
    await persistNote(parent)
  }

  note.pos = worldPos
  currentPage.value.rootNoteIds.push(noteId)
  await persistPage()
  await persistNote(note)

  const notesAfter = history.snapshotNotes(notes, [noteId, parentNoteId])

  history.pushAction({
    description: 'Move note to canvas',
    notesBefore,
    notesAfter,
    rootIdsBefore,
    rootIdsAfter: getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [noteId],
  })
}

function findParent(noteId: string): string | undefined {
  for (const [id, note] of notes) {
    if (note.container.childIds.includes(noteId)) return id
  }
  return undefined
}

// ── Arrows ──

function getArrowsForNote(noteId: string): Arrow[] {
  const result: Arrow[] = []
  for (const arrow of arrows.values()) {
    if (arrow.sourceNoteId === noteId || arrow.targetNoteId === noteId) {
      result.push(arrow)
    }
  }
  return result
}

async function createArrow(
  sourceNoteId: string,
  targetNoteId: string,
  sourceAnchor: AnchorSide = 'right',
  targetAnchor: AnchorSide = 'left',
): Promise<Arrow> {
  if (!currentPage.value) throw new Error('No page loaded')

  const arrow = createDefaultArrow(currentPage.value.id, sourceNoteId, targetNoteId, sourceAnchor, targetAnchor)
  const saved = await storage.saveArrow(arrow)
  arrows.set(saved.id, saved)

  // Undo
  history.pushAction({
    description: 'Create arrow',
    notesBefore: {},
    notesAfter: {},
    arrowsBefore: { [saved.id]: null },
    arrowsAfter: { [saved.id]: deepClone(saved) },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: selectionArray(),
    selectionAfter: selectionArray(),
    arrowSelectionBefore: [],
    arrowSelectionAfter: [saved.id],
  })

  // Select the new arrow
  selectedNoteIds.clear()
  selectedArrowIds.clear()
  selectedArrowIds.add(saved.id)

  return saved
}

async function updateArrow(arrow: Arrow) {
  arrow.updatedAt = Date.now()
  arrows.set(arrow.id, arrow)
  await storage.saveArrow(arrow)
}

async function deleteArrow(arrowId: string) {
  const arrow = arrows.get(arrowId)
  if (!arrow) return

  const arrowSelBefore = Array.from(selectedArrowIds)

  arrows.delete(arrowId)
  selectedArrowIds.delete(arrowId)
  await storage.deleteArrow(arrowId)

  history.pushAction({
    description: 'Delete arrow',
    notesBefore: {},
    notesAfter: {},
    arrowsBefore: { [arrowId]: deepClone(arrow) },
    arrowsAfter: { [arrowId]: null },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: selectionArray(),
    selectionAfter: selectionArray(),
    arrowSelectionBefore: arrowSelBefore,
    arrowSelectionAfter: [],
  })
}

async function deleteSelectedArrows() {
  const ids = Array.from(selectedArrowIds)
  if (ids.length === 0) return

  const arrowsBefore: Record<string, Arrow | null> = {}
  const arrowsAfterMap: Record<string, Arrow | null> = {}
  const arrowSelBefore = [...ids]

  for (const id of ids) {
    const arrow = arrows.get(id)
    if (arrow) {
      arrowsBefore[id] = deepClone(arrow)
      arrowsAfterMap[id] = null
      arrows.delete(id)
      await storage.deleteArrow(id)
    }
  }
  selectedArrowIds.clear()

  history.pushAction({
    description: 'Delete arrows',
    notesBefore: {},
    notesAfter: {},
    arrowsBefore,
    arrowsAfter: arrowsAfterMap,
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: selectionArray(),
    selectionAfter: selectionArray(),
    arrowSelectionBefore: arrowSelBefore,
    arrowSelectionAfter: [],
  })
}

// ── Toggle actions (context menu items that should be undoable) ──

function pushNotePropertyAction(noteId: string, before: Note, description: string) {
  const after = history.snapshotNote(notes, noteId)
  history.pushAction({
    description,
    notesBefore: { [noteId]: before },
    notesAfter: { [noteId]: after },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: [noteId],
    selectionAfter: [noteId],
  })
}

// ── Page management ──

async function deletePage(pageId: string) {
  const wasCurrent = currentPageId.value === pageId

  // Clean up note links pointing to this page across ALL pages
  const allPages = await storage.listPages()
  for (const pageSummary of allPages) {
    if (pageSummary.id === pageId) continue  // skip the page being deleted
    const pageNotes = await storage.getNotesForPage(pageSummary.id)
    const dirtyNotes: Note[] = []
    for (const note of pageNotes) {
      if (note.link === pageId) {
        note.link = ''
        note.updatedAt = Date.now()
        dirtyNotes.push(note)
      }
    }
    if (dirtyNotes.length > 0) {
      await storage.saveNotes(dirtyNotes)
    }
  }

  // Also clean currently loaded in-memory notes
  for (const [, note] of notes) {
    if (note.link === pageId) {
      note.link = ''
      note.updatedAt = Date.now()
      await storage.saveNote(toRaw(note))
    }
  }

  // Remove from page history
  pageHistory.value = pageHistory.value.filter(id => id !== pageId)

  await storage.deletePage(pageId)
  await loadPageList()
  if (wasCurrent) {
    // Navigate to another page if available
    if (pageList.value.length > 0) {
      await navigateToPage(pageList.value[0].id, false)
    } else {
      currentPage.value = null
      currentPageId.value = null
      notes.clear()
      arrows.clear()
      history.clear()
    }
  }
}

async function renamePage(pageId: string, title: string) {
  const page = await storage.getPage(pageId)
  if (page) {
    page.title = title
    await storage.savePage(page)
    await loadPageList()
    if (currentPage.value?.id === pageId) {
      currentPage.value.title = title
    }
  }
}

async function exportData() {
  return storage.exportAll()
}

async function importData(data: { pages: Page[]; notes: Note[]; arrows: Arrow[] }) {
  await storage.importAll(data)
  await loadPageList()
  if (currentPageId.value) await loadPage(currentPageId.value)
}

export const appStore = {
  // Init
  setStorage,

  // State
  currentPageId,
  currentPage,
  notes,
  arrows,
  pageList,
  pageHistory,
  loading,
  selectedNoteIds,
  selectedArrowIds,
  editingNoteId,
  dragTick,
  setArrowRecompute,
  triggerArrowRecompute,

  // Computed
  rootNotes,
  selectedNotes,

  // Selection
  selectNote,
  toggleNoteSelection,
  selectArrow,
  clearSelection,
  isSelected,

  // Editing
  setEditingNote,
  clearEditing,

  // Page
  loadPageList,
  loadPage,
  createPage,
  navigateToPage,
  navigateBack,
  deletePage,
  renamePage,

  // Note
  createNote,
  updateNote,
  markNoteDirty,
  markPageDirty,
  flushPendingSaves,
  hasPendingSaves,
  deleteNote,
  deleteSelected,
  deleteAllSelected,
  bringToTop,
  pushMoveAction,
  pushResizeAction,
  pushNotePropertyAction,
  reparentNote,
  unparentNote,
  findParent,

  // Arrows
  getArrowsForNote,
  createArrow,
  updateArrow,
  deleteArrow,
  deleteSelectedArrows,

  // Data
  exportData,
  importData,

  // History
  undo: history.undo,
  redo: history.redo,
  canUndo: history.canUndo,
  canRedo: history.canRedo,
}
