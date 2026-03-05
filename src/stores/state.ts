/**
 * Shared reactive state, storage accessor, and low-level helpers.
 * This is the foundation that all other store modules import from.
 * No store module imports should appear here — only Vue, types, and panes.
 */

import { reactive, ref, computed, toRaw, nextTick, watch } from 'vue'
import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'
import type { Link } from '../types/link'
import type { Page, PageSummary } from '../types/page'
import type { StorageBackend } from '../storage/interface'
import { activePane, activePaneId, panes, type PaneContext } from './panes'

// ── Storage ──

let storage: StorageBackend

export function setStorage(backend: StorageBackend) {
  storage = backend
}

export function getStorage(): StorageBackend {
  return storage
}

// ── Helpers ──

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(toRaw(obj)))
}

// ── Reactive state ──

// Multi-page: all loaded pages keyed by pageId
export const loadedPages = reactive<Map<string, Page>>(new Map())

// Active pane's page (computed — most existing code reads these)
export const currentPageId = computed<string | null>(() => {
  return activePane.value?.pageId ?? null
})
export const currentPage = computed<Page | null>(() => {
  const id = activePane.value?.pageId
  return id ? loadedPages.get(id) ?? null : null
})

// Shared data maps — hold items from ALL loaded pages
export const notes = reactive<Map<string, Note>>(new Map())
export const arrows = reactive<Map<string, Arrow>>(new Map())
export const links = reactive<Map<string, Link>>(new Map())

export const pageList = ref<PageSummary[]>([])
export const pageHistory = ref<string[]>([])
export const loading = ref(false)

// Linking mode: when non-null, clicking a note creates a link from this source
export const linkingSourceId = ref<string | null>(null)

// Set to a note ID to pan the canvas to focus on it, then auto-clears
export const focusNoteId = ref<string | null>(null)

// Container reorder: tracks where a ghost-dragged note would be inserted
export const dropInsertParentId = ref<string | null>(null)
export const dropInsertIndex = ref<number>(-1)

// Selection & editing — these globals reflect the ACTIVE pane's state.
// When active pane changes, we swap the backing data.
export const selectedNoteIds = reactive(new Set<string>())
export const selectedArrowIds = reactive(new Set<string>())
export const editingNoteId = ref<string | null>(null)

// Snapshot of note being edited (captured on edit start, used to build undo on edit end)
export let editStartSnapshot: Note | null = null

export function setEditStartSnapshot(snapshot: Note | null) {
  editStartSnapshot = snapshot
  // Also sync to pane context
  const pane = activePane.value
  if (pane) pane.editStartSnapshot = snapshot
}

// ── Pane selection sync ──

/** Save current globals into the given pane context */
export function saveSelectionToPane(pane: PaneContext) {
  pane.selectedNoteIds = new Set(selectedNoteIds)
  pane.selectedArrowIds = new Set(selectedArrowIds)
  pane.editingNoteId = editingNoteId.value
  pane.editStartSnapshot = editStartSnapshot
}

/** Restore globals from the given pane context */
export function restoreSelectionFromPane(pane: PaneContext) {
  selectedNoteIds.clear()
  for (const id of pane.selectedNoteIds) selectedNoteIds.add(id)
  selectedArrowIds.clear()
  for (const id of pane.selectedArrowIds) selectedArrowIds.add(id)
  editingNoteId.value = pane.editingNoteId
  editStartSnapshot = pane.editStartSnapshot
}

// Watch for active pane changes and swap selection
let _prevPaneId: string | null = null
watch(activePaneId, (newId, oldId) => {
  // Save outgoing pane's selection
  if (oldId) {
    const oldPane = panes.get(oldId)
    if (oldPane) saveSelectionToPane(oldPane)
  }
  // Restore incoming pane's selection
  if (newId) {
    const newPane = panes.get(newId)
    if (newPane) restoreSelectionFromPane(newPane)
  } else {
    selectedNoteIds.clear()
    selectedArrowIds.clear()
    editingNoteId.value = null
    editStartSnapshot = null
  }
  _prevPaneId = newId
})

// ── Computed ──

export const rootNotes = computed(() => {
  if (!currentPage.value) return []
  return currentPage.value.rootNoteIds
    .map(id => notes.get(id))
    .filter((n): n is Note => n !== undefined)
})

export const selectedNotes = computed(() => {
  return Array.from(selectedNoteIds)
    .map(id => notes.get(id))
    .filter((n): n is Note => n !== undefined)
})

// ── Per-page helpers ──

/** Get root note IDs for a specific page (used by per-pane rendering) */
export function getRootIdsForPage(pageId: string): string[] {
  const page = loadedPages.get(pageId)
  return page ? [...page.rootNoteIds] : []
}

/** Get root notes for a specific page (used by CanvasView per-pane) */
export function getRootNotesForPage(pageId: string): Note[] {
  const page = loadedPages.get(pageId)
  if (!page) return []
  return page.rootNoteIds
    .map(id => notes.get(id))
    .filter((n): n is Note => n !== undefined)
}

/** Get the Page object for a note's pageId */
export function getPageForNote(noteId: string): Page | null {
  const note = notes.get(noteId)
  if (!note) return null
  return loadedPages.get(note.pageId) ?? null
}

// ── Internal helpers ──

export function getRootIds(): string[] {
  return currentPage.value ? [...currentPage.value.rootNoteIds] : []
}

export function selectionArray(): string[] {
  return Array.from(selectedNoteIds)
}

export async function persistNote(note: Note) {
  note.updatedAt = Date.now()
  await storage.saveNote(note)
}

export async function persistPage(page?: Page) {
  const p = page ?? currentPage.value
  if (p) {
    p.updatedAt = Date.now()
    await storage.savePage(p)
  }
}

// ── Batched save system ──

const dirtyNoteIds = new Set<string>()
const dirtyPageIds = new Set<string>()
export const hasPendingSaves = ref(false)
let _saveBatchTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(delay = 300) {
  hasPendingSaves.value = true
  if (_saveBatchTimer) clearTimeout(_saveBatchTimer)
  _saveBatchTimer = setTimeout(() => flushPendingSaves(), delay)
}

export function markNoteDirty(note: Note, delay = 300) {
  dirtyNoteIds.add(note.id)
  scheduleSave(delay)
}

export function markPageDirty(delay = 300, pageId?: string) {
  const id = pageId ?? currentPage.value?.id
  if (id) dirtyPageIds.add(id)
  scheduleSave(delay)
}

export async function flushPendingSaves() {
  if (_saveBatchTimer) { clearTimeout(_saveBatchTimer); _saveBatchTimer = null }

  const pendingNoteIds = dirtyNoteIds.size > 0 ? new Set(dirtyNoteIds) : null
  const pendingPageIds = dirtyPageIds.size > 0 ? new Set(dirtyPageIds) : null
  dirtyNoteIds.clear()
  dirtyPageIds.clear()

  const now = Date.now()

  // Group dirty notes by pageId
  const notesByPage = new Map<string, Note[]>()
  if (pendingNoteIds) {
    for (const id of pendingNoteIds) {
      const note = notes.get(id)
      if (note) {
        note.updatedAt = now
        const list = notesByPage.get(note.pageId) || []
        list.push(toRaw(note))
        notesByPage.set(note.pageId, list)
      }
    }
  }

  try {
    // For each page that has dirty notes and/or dirty page metadata
    const allPageIds = new Set([
      ...notesByPage.keys(),
      ...(pendingPageIds ?? []),
    ])

    for (const pageId of allPageIds) {
      const page = loadedPages.get(pageId)
      const pageNotes = notesByPage.get(pageId)
      const pageDirty = pendingPageIds?.has(pageId) ?? false

      if (pageDirty && page && pageNotes && pageNotes.length > 0) {
        page.updatedAt = now
        await storage.savePageBundle(toRaw(page), pageNotes)
      } else if (pageNotes && pageNotes.length > 0) {
        await storage.saveNotes(pageNotes)
      } else if (pageDirty && page) {
        page.updatedAt = now
        await storage.savePage(toRaw(page))
      }
    }
  } catch (e) {
    console.error("[flushPendingSaves] Write failed, re-queuing:", e)
    if (pendingNoteIds) { for (const id of pendingNoteIds) dirtyNoteIds.add(id) }
    if (pendingPageIds) { for (const id of pendingPageIds) dirtyPageIds.add(id) }
    scheduleSave(1000)
    return
  }

  if (dirtyNoteIds.size === 0 && dirtyPageIds.size === 0) {
    hasPendingSaves.value = false
  }
}

// ── Z-index ──

export function bringToTop(note: Note) {
  // Look up the note's page (may not be currentPage in split view)
  const page = loadedPages.get(note.pageId) ?? currentPage.value
  if (!page) return
  note.zIndex = page.nextZIndex++
  markNoteDirty(note)
  markPageDirty(300, note.pageId)
}

// ── Parent lookup map (childId → parentId) ──

export const parentMap = new Map<string, string>()

/** Rebuild the entire parent map from the current notes collection.
 *  Also detects and breaks cycles in childIds to prevent infinite rendering. */
export function rebuildParentMap() {
  parentMap.clear()
  for (const [id, note] of notes) {
    if (note.container.enabled) {
      for (const childId of note.container.childIds) {
        parentMap.set(childId, id)
      }
    }
  }

  // Detect and break cycles: walk up from each note, if we revisit → cycle
  for (const [id] of notes) {
    const visited = new Set<string>()
    let cur = id
    while (parentMap.has(cur)) {
      if (visited.has(cur)) {
        const badParentId = parentMap.get(cur)!
        const badParent = notes.get(badParentId)
        if (badParent) {
          badParent.container.childIds = badParent.container.childIds.filter(c => c !== cur)
          console.warn(`[rebuildParentMap] Broke cycle: removed ${cur} from ${badParentId}.childIds`)
        }
        parentMap.delete(cur)
        break
      }
      visited.add(cur)
      cur = parentMap.get(cur)!
    }
  }
}

/** Set a single child→parent relationship */
export function setParent(childId: string, parentId: string) {
  parentMap.set(childId, parentId)
}

/** Remove a child→parent relationship */
export function removeParent(childId: string) {
  parentMap.delete(childId)
}

/** Remove all parent entries for a set of note IDs (used during bulk delete) */
export function removeParents(ids: string[]) {
  for (const id of ids) {
    parentMap.delete(id)
  }
}

// ── Drag session tracking (for arrow rect caching) ──

export const dragSessionNoteIds = reactive(new Set<string>())
export const dragNoteSizeCache = new Map<string, { w: number; h: number }>()

// ── Arrow recompute ──

const arrowRecomputeCallbacks = new Map<string, () => void>()

export function setArrowRecompute(fn: () => void, paneId?: string) {
  const id = paneId ?? activePaneId.value
  if (id) arrowRecomputeCallbacks.set(id, fn)
}

export function clearArrowRecompute(paneId: string) {
  arrowRecomputeCallbacks.delete(paneId)
}

/** Schedule arrow recompute after DOM update (for non-drag callers: undo, align, etc.) */
export function triggerArrowRecompute() {
  nextTick(() => {
    requestAnimationFrame(() => {
      for (const fn of arrowRecomputeCallbacks.values()) fn()
    })
  })
}

/** Synchronous arrow recompute — call from within drag rAF when note positions
 *  are already updated and rects can be computed from data. */
export function recomputeArrowsSync() {
  for (const fn of arrowRecomputeCallbacks.values()) fn()
}

// ── Page data lifecycle ──

/** Load a page's data into shared Maps (additive — does not clear other pages) */
export function loadPageData(
  page: Page,
  pageNotes: Note[],
  pageArrows: Arrow[],
  pageLinks: Link[],
) {
  loadedPages.set(page.id, page)
  for (const note of pageNotes) {
    // Backward compat: add autoBody/foldState for notes saved before these fields existed
    if (!note.autoBody) {
      note.autoBody = { enabled: false, content: { type: 'doc', content: [{ type: 'paragraph' }] }, wrap: true, height: 'auto' }
    }
    if (!note.foldState) {
      note.foldState = {
        autoBody: note.collapsed ?? false,
        body: note.collapsed ?? false,
        container: note.collapsed ?? false,
        links: note.collapsed ?? false,
      }
    }
    if (!note.linkOrder) {
      note.linkOrder = []
    }
    notes.set(note.id, note)
  }
  for (const arrow of pageArrows) arrows.set(arrow.id, arrow)
  for (const link of pageLinks) links.set(link.id, link)
  rebuildParentMap()
}

/** Unload a page's data from shared Maps (only if no pane still references it) */
export function unloadPageData(pageId: string) {
  loadedPages.delete(pageId)
  // Remove notes, arrows, links belonging to this page
  for (const [id, note] of notes) {
    if (note.pageId === pageId) notes.delete(id)
  }
  for (const [id, arrow] of arrows) {
    if (arrow.pageId === pageId) arrows.delete(id)
  }
  for (const [id, link] of links) {
    if (link.pageId === pageId) links.delete(id)
  }
  rebuildParentMap()
}
