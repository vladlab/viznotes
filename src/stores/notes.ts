/**
 * Note CRUD, deletion, and reparenting operations.
 * Imports from state.ts, history.ts, and arrows.ts (for connected arrow cleanup).
 */

import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'
import type { Link } from '../types/link'
import { createDefaultNote } from '../types/note'
import { history } from './history'
import { deleteSelectedArrows } from './arrows'
import { deleteLinksForNote, getLinksForNote } from './links'
import {
  notes,
  arrows,
  links,
  currentPage,
  selectedNoteIds,
  selectedArrowIds,
  editingNoteId,
  setEditStartSnapshot,
  selectionArray,
  getRootIds,
  persistNote,
  persistPage,
  deepClone,
  getStorage,
  markNoteDirty,
  markPageDirty,
  parentMap,
  setParent,
  removeParent,
  removeParents,
  triggerArrowRecompute,
} from './state'

// ── Note CRUD ──

export async function createNote(
  pos: { x: number; y: number },
  parentNoteId?: string,
  options?: {
    initialText?: string;
    headContent?: any;
    startEditing?: boolean;
    bodyText?: string;
    enableBody?: boolean;
    collapsed?: boolean;
    link?: string;
    nodeType?: string;
  }
): Promise<Note> {
  if (!currentPage.value) throw new Error('No page loaded')

  const storage = getStorage()
  const selBefore = selectionArray()
  const rootIdsBefore = getRootIds()

  // Snapshot parent before
  const parentBefore = parentNoteId ? history.snapshotNote(notes, parentNoteId) : null

  const note = createDefaultNote(currentPage.value.id, pos)
  note.zIndex = currentPage.value.nextZIndex++

  // Set head content: raw ProseMirror JSON takes priority over plain text
  if (options?.headContent) {
    note.head.content = options.headContent
  } else if (options?.initialText) {
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
  } else if (options?.enableBody) {
    note.body.enabled = true
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
      setParent(saved.id, parentNoteId)
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
    setEditStartSnapshot(deepClone(saved))
  }

  // Build undo action
  const rawBefore: Record<string, Note | null> = { [saved.id]: null }
  const rawAfter: Record<string, Note | null> = { [saved.id]: deepClone(saved) }

  if (parentNoteId) {
    rawBefore[parentNoteId] = parentBefore
    rawAfter[parentNoteId] = history.snapshotNote(notes, parentNoteId)
  }

  const { notesBefore, notesAfter } = history.optimizeSnapshots(rawBefore, rawAfter)

  history.pushAction({
    description: 'Create note',
    pageId: currentPage.value?.id ?? '',
    notesBefore,
    notesAfter,
    rootIdsBefore: parentNoteId ? null : rootIdsBefore,
    rootIdsAfter: parentNoteId ? null : getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [saved.id],
  })

  return saved
}

export async function updateNote(note: Note) {
  const storage = getStorage()
  note.updatedAt = Date.now()
  notes.set(note.id, note)
  await storage.saveNote(note)
  if (currentPage.value) {
    currentPage.value.updatedAt = Date.now()
    await storage.savePage(currentPage.value)
  }
  // Trigger arrow recompute in case position/size changed.
  // Debounced via nextTick+rAF so multiple calls per frame coalesce.
  triggerArrowRecompute()
}

// ── History helpers ──

/**
 * Record a move action for notes that were dragged.
 * Call this AFTER the drag completes with before/after positions.
 */
export function pushMoveAction(movedNotes: Array<{ id: string; before: Note; after: Note }>) {
  if (movedNotes.length === 0) return

  const notesBefore: Record<string, Partial<Note> | null> = {}
  const notesAfter: Record<string, Partial<Note> | null> = {}
  const sel = movedNotes.map(m => m.id)

  for (const m of movedNotes) {
    notesBefore[m.id] = history.diffNote(m.after, m.before)
    notesAfter[m.id] = history.diffNote(m.before, m.after)
  }

  history.pushAction({
    description: 'Move note' + (movedNotes.length > 1 ? 's' : ''),
    pageId: movedNotes[0].after.pageId,
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
export function pushResizeAction(noteId: string, before: Note, after: Note) {
  history.pushAction({
    description: 'Resize note',
    pageId: currentPage.value?.id ?? '',
    notesBefore: { [noteId]: history.diffNote(after, before) },
    notesAfter: { [noteId]: history.diffNote(before, after) },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: [noteId],
    selectionAfter: [noteId],
  })
}

/**
 * Record a generic note property change (context menu toggles, color, etc.)
 */
export function pushNotePropertyAction(noteId: string, before: Note, description: string) {
  const after = history.snapshotNote(notes, noteId)!
  history.pushAction({
    description,
    pageId: before.pageId,
    notesBefore: { [noteId]: history.diffNote(after, before) },
    notesAfter: { [noteId]: history.diffNote(before, after) },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: [noteId],
    selectionAfter: [noteId],
  })
}

// ── Deletion ──

export async function deleteNote(noteId: string, parentNoteId?: string) {
  if (!currentPage.value) return

  const storage = getStorage()
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

  // Collect links connected to any deleted note
  const linksToDelete: string[] = []
  const linksBefore: Record<string, Link | null> = {}
  const linksAfterMap: Record<string, Link | null> = {}
  for (const link of links.values()) {
    if (allIds.includes(link.noteIdA) || allIds.includes(link.noteIdB)) {
      linksToDelete.push(link.id)
      linksBefore[link.id] = deepClone(link)
      linksAfterMap[link.id] = null
    }
  }

  // Snapshot parent
  if (parentNoteId) {
    notesBefore[parentNoteId] = history.snapshotNote(notes, parentNoteId)
  }

  // Perform delete
  editingNoteId.value = null
  setEditStartSnapshot(null)

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
  removeParents(allIds)
  await storage.deleteNotes(allIds)

  // Delete connected arrows
  for (const aid of arrowsToDelete) {
    arrows.delete(aid)
    selectedArrowIds.delete(aid)
  }
  if (arrowsToDelete.length > 0) {
    await storage.deleteArrows(arrowsToDelete)
  }

  // Delete connected links
  for (const lid of linksToDelete) {
    links.delete(lid)
  }
  if (linksToDelete.length > 0) {
    await storage.deleteLinks(linksToDelete)
  }

  // Snapshot parent after
  if (parentNoteId) {
    notesAfter[parentNoteId] = history.snapshotNote(notes, parentNoteId)
  }

  const optimized = history.optimizeSnapshots(notesBefore, notesAfter)

  history.pushAction({
    description: 'Delete note',
    pageId: currentPage.value?.id ?? '',
    notesBefore: optimized.notesBefore,
    notesAfter: optimized.notesAfter,
    arrowsBefore,
    arrowsAfter: arrowsAfterMap,
    linksBefore,
    linksAfter: linksAfterMap,
    rootIdsBefore: parentNoteId ? null : rootIdsBefore,
    rootIdsAfter: parentNoteId ? null : getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [],
    arrowSelectionBefore: arrowSelBefore,
    arrowSelectionAfter: [],
  })
}

export async function deleteSelected() {
  if (selectedNoteIds.size === 0) return
  if (!currentPage.value) return

  const storage = getStorage()
  const selBefore = selectionArray()
  const arrowSelBefore = Array.from(selectedArrowIds)
  const rootIdsBefore = getRootIds()

  const ids = Array.from(selectedNoteIds)

  // Filter to "top-level" selected notes only — if a note's ancestor is also
  // selected, the ancestor's collectDescendantIds already includes it.
  // Without this, selecting both parent + child causes double-deletion,
  // broken parent lookups, and corrupt undo snapshots.
  const selectedSet = new Set(ids)
  const topLevelIds = ids.filter(id => {
    const visited = new Set<string>()
    let cur = findParent(id)
    while (cur) {
      if (visited.has(cur)) break  // Cycle protection
      visited.add(cur)
      if (selectedSet.has(cur)) return false
      cur = findParent(cur)
    }
    return true
  })

  // Collect ALL notes to delete and their parents
  const allDeleteIds: string[] = []
  const parentSnapshots: Record<string, Note | null> = {}

  for (const noteId of topLevelIds) {
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
  const deleteIdSet = new Set(uniqueDeleteIds)
  const arrowsToDelete: string[] = []
  const arrowsBefore: Record<string, Arrow | null> = {}
  const arrowsAfterMap: Record<string, Arrow | null> = {}
  for (const arrow of arrows.values()) {
    if (deleteIdSet.has(arrow.sourceNoteId) || deleteIdSet.has(arrow.targetNoteId)) {
      arrowsToDelete.push(arrow.id)
      arrowsBefore[arrow.id] = deepClone(arrow)
      arrowsAfterMap[arrow.id] = null
    }
  }

  // Collect links connected to deleted notes
  const linksToDeleteSel: string[] = []
  const linksBeforeSel: Record<string, Link | null> = {}
  const linksAfterSel: Record<string, Link | null> = {}
  for (const link of links.values()) {
    if (deleteIdSet.has(link.noteIdA) || deleteIdSet.has(link.noteIdB)) {
      linksToDeleteSel.push(link.id)
      linksBeforeSel[link.id] = deepClone(link)
      linksAfterSel[link.id] = null
    }
  }

  // Perform deletions
  editingNoteId.value = null
  setEditStartSnapshot(null)

  for (const noteId of topLevelIds) {
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
  }

  // Delete all notes + descendants in one pass
  for (const id of uniqueDeleteIds) {
    notes.delete(id)
    selectedNoteIds.delete(id)
  }
  removeParents(uniqueDeleteIds)
  await storage.deleteNotes(uniqueDeleteIds)

  // Delete connected arrows
  for (const aid of arrowsToDelete) {
    arrows.delete(aid)
    selectedArrowIds.delete(aid)
  }
  if (arrowsToDelete.length > 0) await storage.deleteArrows(arrowsToDelete)

  // Delete connected links
  for (const lid of linksToDeleteSel) links.delete(lid)
  if (linksToDeleteSel.length > 0) await storage.deleteLinks(linksToDeleteSel)

  await persistPage()

  // Snapshot parents after
  for (const parentId of Object.keys(parentSnapshots)) {
    notesAfter[parentId] = history.snapshotNote(notes, parentId)
  }

  const optimized = history.optimizeSnapshots(notesBefore, notesAfter)

  history.pushAction({
    description: 'Delete notes',
    pageId: currentPage.value?.id ?? '',
    notesBefore: optimized.notesBefore,
    notesAfter: optimized.notesAfter,
    arrowsBefore: arrowsBefore,
    arrowsAfter: arrowsAfterMap,
    linksBefore: linksBeforeSel,
    linksAfter: linksAfterSel,
    rootIdsBefore,
    rootIdsAfter: getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [],
    arrowSelectionBefore: arrowSelBefore,
    arrowSelectionAfter: [],
  })
}

/** Delete all currently selected notes AND arrows */
export async function deleteAllSelected() {
  // Delete selected arrows first
  if (selectedArrowIds.size > 0) {
    await deleteSelectedArrows()
  }
  // Then delete selected notes (which also cleans up their arrows)
  if (selectedNoteIds.size > 0) {
    await deleteSelected()
  }
}

// ── Reparenting ──

export async function reparentNote(noteId: string, oldParentNoteId: string | undefined, newParentNoteId: string) {
  if (!currentPage.value) return
  if (noteId === newParentNoteId) return  // Can't parent into self
  const note = notes.get(noteId)
  if (!note) return

  // Prevent reparenting into own descendants (would create cycle)
  const descendants = new Set(history.collectDescendantIds(notes, noteId))
  if (descendants.has(newParentNoteId)) return

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
    setParent(noteId, newParentNoteId)
    // Reset position/size for list layout
    note.pos = { x: 0, y: 0 }
    note.width = 'auto'
    note.height = 'auto'
    await persistNote(newParent)
    await persistNote(note)
  }

  const notesAfterRaw = history.snapshotNotes(notes, [...new Set(affectedIds)])

  const optimized = history.optimizeSnapshots(notesBefore, notesAfterRaw)

  history.pushAction({
    description: 'Move note to container',
    pageId: currentPage.value?.id ?? '',
    notesBefore: optimized.notesBefore,
    notesAfter: optimized.notesAfter,
    rootIdsBefore: oldParentNoteId ? null : rootIdsBefore,
    rootIdsAfter: oldParentNoteId ? null : getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [noteId],
  })

  // Arrows must recompute after the DOM settles into new tree structure
  triggerArrowRecompute()
}

export async function unparentNote(noteId: string, parentNoteId: string, worldPos: { x: number; y: number }) {
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
  removeParent(noteId)
  currentPage.value.rootNoteIds.push(noteId)
  await persistPage()
  await persistNote(note)

  const notesAfterRaw = history.snapshotNotes(notes, [noteId, parentNoteId])

  const optimized = history.optimizeSnapshots(notesBefore, notesAfterRaw)

  history.pushAction({
    description: 'Move note to canvas',
    pageId: currentPage.value?.id ?? '',
    notesBefore: optimized.notesBefore,
    notesAfter: optimized.notesAfter,
    rootIdsBefore,
    rootIdsAfter: getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [noteId],
  })

  // Arrows must recompute after the DOM settles into new tree structure
  triggerArrowRecompute()
}

export function findParent(noteId: string): string | undefined {
  return parentMap.get(noteId)
}

export async function reorderNote(noteId: string, parentNoteId: string, newIndex: number) {
  const parent = notes.get(parentNoteId)
  if (!parent) return

  const oldIndex = parent.container.childIds.indexOf(noteId)
  if (oldIndex === -1) return

  // Remove from old position, insert at new
  // Adjust index: removing before the target shifts it down by one
  const adjustedIndex = newIndex > oldIndex ? newIndex - 1 : newIndex
  if (adjustedIndex === oldIndex) return

  const selBefore = selectionArray()
  const notesBefore = history.snapshotNotes(notes, [parentNoteId])

  parent.container.childIds.splice(oldIndex, 1)
  parent.container.childIds.splice(adjustedIndex, 0, noteId)

  await persistNote(parent)

  const notesAfterRaw = history.snapshotNotes(notes, [parentNoteId])
  const optimized = history.optimizeSnapshots(notesBefore, notesAfterRaw)

  history.pushAction({
    description: 'Reorder note in container',
    pageId: currentPage.value?.id ?? '',
    notesBefore: optimized.notesBefore,
    notesAfter: optimized.notesAfter,
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: selBefore,
    selectionAfter: [noteId],
  })
}
