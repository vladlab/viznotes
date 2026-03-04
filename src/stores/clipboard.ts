/**
 * Clipboard store for copy/paste/duplicate of notes and arrows.
 * Stores deep-cloned note trees and internal arrows.
 */

import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'
import { history } from './history'
import {
  notes,
  arrows,
  currentPage,
  selectedNoteIds,
  selectedArrowIds,
  selectionArray,
  getRootIds,
  deepClone,
  getStorage,
  setParent,
  triggerArrowRecompute,
} from './state'

// ── Clipboard state ──

interface ClipboardData {
  /** Cloned root notes (top-level of the selection) */
  rootNotes: Note[]
  /** All notes including descendants */
  allNotes: Note[]
  /** Arrows between any of the copied notes */
  arrows: Arrow[]
  /** Original root positions for computing paste offsets */
  sourceCenter: { x: number; y: number }
}

let clipboard: ClipboardData | null = null
let pasting = false  // Prevents concurrent paste operations

// ── Helpers ──

/** Collect a note and all its descendants recursively */
function collectTree(noteId: string, visited = new Set<string>()): Note[] {
  if (visited.has(noteId)) return []  // Cycle protection
  visited.add(noteId)
  const note = notes.get(noteId)
  if (!note) return []
  const result: Note[] = [deepClone(note)]
  if (note.container.enabled) {
    for (const childId of note.container.childIds) {
      result.push(...collectTree(childId, visited))
    }
  }
  return result
}

/** Compute center of a set of root notes */
function computeCenter(noteList: Note[]): { x: number; y: number } {
  if (noteList.length === 0) return { x: 0, y: 0 }
  let sumX = 0, sumY = 0
  for (const n of noteList) {
    sumX += n.pos.x
    sumY += n.pos.y
  }
  return { x: sumX / noteList.length, y: sumY / noteList.length }
}

/** Filter to top-level selected IDs (skip any whose ancestor is also selected) */
function topLevelIds(ids: Set<string>): string[] {
  const result: string[] = []
  for (const id of ids) {
    let dominated = false
    const visited = new Set<string>()
    let parentId = findParentId(id)
    while (parentId) {
      if (visited.has(parentId)) break  // Cycle protection
      visited.add(parentId)
      if (ids.has(parentId)) { dominated = true; break }
      parentId = findParentId(parentId)
    }
    if (!dominated) result.push(id)
  }
  return result
}

function findParentId(noteId: string): string | undefined {
  for (const [, note] of notes) {
    if (note.container.enabled && note.container.childIds.includes(noteId)) {
      return note.id
    }
  }
  return undefined
}

// ── Public API ──

export function copySelected() {
  if (selectedNoteIds.size === 0) return

  const rootIds = topLevelIds(selectedNoteIds)
  const allNotes: Note[] = []
  const allNoteIds = new Set<string>()

  for (const id of rootIds) {
    const tree = collectTree(id)
    for (const n of tree) {
      if (!allNoteIds.has(n.id)) {
        allNoteIds.add(n.id)
        allNotes.push(n)
      }
    }
  }

  // Collect arrows where both endpoints are in the copied set
  const copiedArrows: Arrow[] = []
  for (const arrow of arrows.values()) {
    if (allNoteIds.has(arrow.sourceNoteId) && allNoteIds.has(arrow.targetNoteId)) {
      copiedArrows.push(deepClone(arrow))
    }
  }

  const rootNotes = rootIds.map(id => allNotes.find(n => n.id === id)!).filter(Boolean)

  clipboard = {
    rootNotes,
    allNotes,
    arrows: copiedArrows,
    sourceCenter: computeCenter(rootNotes),
  }
}

export function hasClipboard(): boolean {
  return clipboard !== null && clipboard.allNotes.length > 0
}

/**
 * Paste clipboard contents onto the given page at the given position.
 * Creates new notes with fresh IDs, remapped parent-child and arrow refs.
 * Returns the IDs of the newly created root notes.
 */
export async function pasteNotes(
  targetPageId: string,
  pos: { x: number; y: number },
): Promise<string[]> {
  if (!clipboard || !currentPage.value) return []
  if (pasting) return []  // Prevent concurrent paste
  pasting = true

  try {

  const storage = getStorage()
  const selBefore = selectionArray()
  const rootIdsBefore = getRootIds()

  // Phase 1: Create all notes in storage, collect new IDs
  const idMap = new Map<string, string>()
  const newNotes: Note[] = []

  for (const orig of clipboard.allNotes) {
    const clone = deepClone(orig)
    clone.id = ''  // storage will assign new ID
    clone.pageId = targetPageId
    clone.createdAt = Date.now()
    clone.updatedAt = Date.now()

    const saved = await storage.saveNote(clone)
    idMap.set(orig.id, saved.id)
    newNotes.push(saved)
  }

  // Phase 2: Remap all references (no reactive updates yet)

  // Remap container childIds
  for (const note of newNotes) {
    if (note.container.enabled) {
      note.container.childIds = note.container.childIds
        .map(id => idMap.get(id) || id)
        .filter(id => newNotes.some(n => n.id === id))
    }
  }

  // Offset root note positions relative to paste target
  const rootNewIds: string[] = []
  for (const origRoot of clipboard.rootNotes) {
    const newId = idMap.get(origRoot.id)
    if (!newId) continue
    rootNewIds.push(newId)

    const newNote = newNotes.find(n => n.id === newId)
    if (newNote) {
      newNote.pos.x = pos.x + (origRoot.pos.x - clipboard.sourceCenter.x)
      newNote.pos.y = pos.y + (origRoot.pos.y - clipboard.sourceCenter.y)
    }
  }

  // Assign zIndices
  for (const note of newNotes) {
    note.zIndex = currentPage.value.nextZIndex++
  }

  // Persist all notes with final state
  for (const note of newNotes) {
    await storage.saveNote(note)
  }

  // Phase 3: Commit to reactive state all at once
  // Add ALL notes to map first (before rootNoteIds), so children
  // are available when Vue renders parent containers
  for (const note of newNotes) {
    notes.set(note.id, note)
  }

  // Set up parent map for children
  for (const note of newNotes) {
    if (note.container.enabled) {
      for (const childId of note.container.childIds) {
        setParent(childId, note.id)
      }
    }
  }

  // Add root notes to page (triggers render)
  for (const id of rootNewIds) {
    currentPage.value.rootNoteIds.push(id)
  }
  await storage.savePage(currentPage.value)

  // Create remapped arrows
  const newArrowIds: string[] = []
  for (const origArrow of clipboard.arrows) {
    const newSourceId = idMap.get(origArrow.sourceNoteId)
    const newTargetId = idMap.get(origArrow.targetNoteId)
    if (!newSourceId || !newTargetId) continue

    const arrow: Arrow = {
      ...deepClone(origArrow),
      id: '',
      pageId: targetPageId,
      sourceNoteId: newSourceId,
      targetNoteId: newTargetId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const saved = await storage.saveArrow(arrow)
    arrows.set(saved.id, saved)
    newArrowIds.push(saved.id)
  }

  // Build undo snapshots
  const notesAfter: Record<string, Note | null> = {}
  const notesBefore: Record<string, Note | null> = {}
  for (const note of newNotes) {
    notesBefore[note.id] = null
    notesAfter[note.id] = deepClone(note)
  }

  const arrowsBefore: Record<string, Arrow | null> = {}
  const arrowsAfter: Record<string, Arrow | null> = {}
  for (const id of newArrowIds) {
    const a = arrows.get(id)
    arrowsBefore[id] = null
    arrowsAfter[id] = a ? deepClone(a) : null
  }

  history.pushAction({
    description: 'Paste notes',
    pageId: currentPage.value?.id ?? '',
    notesBefore,
    notesAfter,
    arrowsBefore,
    arrowsAfter,
    rootIdsBefore,
    rootIdsAfter: getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: rootNewIds,
  })

  // Update selection to pasted notes
  selectedNoteIds.clear()
  selectedArrowIds.clear()
  for (const id of rootNewIds) {
    selectedNoteIds.add(id)
  }

  triggerArrowRecompute()

  return rootNewIds
  } finally {
    pasting = false
  }
}

/**
 * Duplicate notes in-place with an offset.
 * Copies the given note IDs, pastes immediately at an offset.
 */
export async function duplicateNotes(
  noteIds: string[],
  offset: { x: number; y: number } = { x: 30, y: 30 },
): Promise<string[]> {
  if (!currentPage.value) return []

  // Temporarily set clipboard to these notes
  const prevClipboard = clipboard

  const fakeSelection = new Set(noteIds)
  const rootIds = topLevelIds(fakeSelection)
  const allNotes: Note[] = []
  const allNoteIds = new Set<string>()

  for (const id of rootIds) {
    const tree = collectTree(id)
    for (const n of tree) {
      if (!allNoteIds.has(n.id)) {
        allNoteIds.add(n.id)
        allNotes.push(n)
      }
    }
  }

  const copiedArrows: Arrow[] = []
  for (const arrow of arrows.values()) {
    if (allNoteIds.has(arrow.sourceNoteId) && allNoteIds.has(arrow.targetNoteId)) {
      copiedArrows.push(deepClone(arrow))
    }
  }

  const rootNotes = rootIds.map(id => allNotes.find(n => n.id === id)!).filter(Boolean)
  const center = computeCenter(rootNotes)

  clipboard = {
    rootNotes,
    allNotes,
    arrows: copiedArrows,
    sourceCenter: center,
  }

  const result = await pasteNotes(
    currentPage.value!.id,
    { x: center.x + offset.x, y: center.y + offset.y },
  )

  // Restore previous clipboard
  clipboard = prevClipboard

  return result
}
