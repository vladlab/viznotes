/**
 * Shared reactive state, storage accessor, and low-level helpers.
 * This is the foundation that all other store modules import from.
 * No store module imports should appear here — only Vue, types, and history.
 */

import { reactive, ref, computed, toRaw, nextTick } from 'vue'
import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'
import type { Link } from '../types/link'
import type { Page, PageSummary } from '../types/page'
import type { StorageBackend } from '../storage/interface'

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

export const currentPageId = ref<string | null>(null)
export const currentPage = ref<Page | null>(null)
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

// Bumped on every drag frame to force arrow recomputation
export const dragTick = ref(0)

// Container reorder: tracks where a ghost-dragged note would be inserted
export const dropInsertParentId = ref<string | null>(null)
export const dropInsertIndex = ref<number>(-1)

// Direct callback for arrow recomputation — set by ArrowLayer
let arrowRecomputeCallback: (() => void) | null = null

export function setArrowRecompute(fn: () => void) {
  arrowRecomputeCallback = fn
}

export function triggerArrowRecompute() {
  dragTick.value++
  // nextTick ensures Vue has flushed DOM, rAF ensures browser has laid out
  nextTick(() => {
    requestAnimationFrame(() => {
      if (arrowRecomputeCallback) arrowRecomputeCallback()
    })
  })
}

// Selection & editing
export const selectedNoteIds = reactive(new Set<string>())
export const selectedArrowIds = reactive(new Set<string>())
export const editingNoteId = ref<string | null>(null)

// Snapshot of note being edited (captured on edit start, used to build undo on edit end)
export let editStartSnapshot: Note | null = null

export function setEditStartSnapshot(snapshot: Note | null) {
  editStartSnapshot = snapshot
}

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

export async function persistPage() {
  if (currentPage.value) {
    currentPage.value.updatedAt = Date.now()
    await storage.savePage(currentPage.value)
  }
}

// ── Batched save system ──

const dirtyNoteIds = new Set<string>()
const dirtyPage = ref(false)
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

export function markPageDirty(delay = 300) {
  dirtyPage.value = true
  scheduleSave(delay)
}

export async function flushPendingSaves() {
  if (_saveBatchTimer) { clearTimeout(_saveBatchTimer); _saveBatchTimer = null }

  // Capture dirty state atomically — any markNoteDirty/markPageDirty calls
  // that arrive during the async save will re-populate these for the next flush.
  const pendingNoteIds = dirtyNoteIds.size > 0 ? new Set(dirtyNoteIds) : null
  const pendingPage = dirtyPage.value
  dirtyNoteIds.clear()
  dirtyPage.value = false

  const now = Date.now()

  // Collect dirty notes
  const notesToSave: Note[] = []
  if (pendingNoteIds) {
    for (const id of pendingNoteIds) {
      const note = notes.get(id)
      if (note) {
        note.updatedAt = now
        notesToSave.push(toRaw(note))
      }
    }
  }

  // Write to storage — single writePageFile when both are dirty
  try {
  if (pendingPage && currentPage.value && notesToSave.length > 0) {
    // Combined: page metadata + notes in one atomic write
    currentPage.value.updatedAt = now
    await storage.savePageBundle(toRaw(currentPage.value), notesToSave)
  } else if (notesToSave.length > 0) {
    await storage.saveNotes(notesToSave)
  } else if (pendingPage && currentPage.value) {
    currentPage.value.updatedAt = now
    await storage.savePage(toRaw(currentPage.value))
    }
  } catch (e) {
    console.error("[flushPendingSaves] Write failed, re-queuing:", e)
    if (pendingNoteIds) { for (const id of pendingNoteIds) dirtyNoteIds.add(id) }
    if (pendingPage) dirtyPage.value = true
    scheduleSave(1000)
    return
  }

  // Only clear the pending indicator if nothing new arrived during the flush.
  if (dirtyNoteIds.size === 0 && !dirtyPage.value) {
    hasPendingSaves.value = false
  }
}

// ── Z-index ──

export function bringToTop(note: Note) {
  if (!currentPage.value) return
  note.zIndex = currentPage.value.nextZIndex++
  markNoteDirty(note)
  markPageDirty()
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
        // Cycle detected: break it by removing this child from its parent's childIds
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
