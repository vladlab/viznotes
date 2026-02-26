/**
 * App store facade.
 * Wires up history integration and re-exports everything as `appStore`.
 * All business logic lives in the sub-modules.
 */

import { history } from './history'

// ── State ──
import {
  setStorage,
  getStorage,
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
  rootNotes,
  selectedNotes,
  hasPendingSaves,
  markNoteDirty,
  markPageDirty,
  flushPendingSaves,
  deepClone,
  persistNote,
  persistPage,
  rebuildParentMap,
  dragSessionNoteIds,
} from './state'

// ── Selection ──
import {
  selectNote,
  toggleNoteSelection,
  selectArrow,
  clearSelection,
  isSelected,
  setEditingNote,
  clearEditing,
} from './selection'

// ── Notes ──
import {
  createNote,
  updateNote,
  pushMoveAction,
  pushResizeAction,
  pushNotePropertyAction,
  deleteNote,
  deleteSelected,
  deleteAllSelected,
  reparentNote,
  unparentNote,
  findParent,
} from './notes'

// ── Arrows ──
import {
  getArrowsForNote,
  createArrow,
  updateArrow,
  deleteArrow,
  deleteSelectedArrows,
} from './arrows'

// ── Pages ──
import {
  loadPageList,
  loadPage,
  createPage,
  navigateToPage,
  navigateBack,
  deletePage,
  renamePage,
  exportData,
  importData,
} from './pages'

// ── History integration ──
// Called by history module to apply undo/redo snapshots.
// This is the one piece of "glue" that touches all domains.

history.setApplySnapshot(async (action, direction) => {
  const noteSnaps = direction === 'undo' ? action.notesBefore : action.notesAfter
  const arrowSnaps = direction === 'undo' ? action.arrowsBefore : action.arrowsAfter
  const rootIds = direction === 'undo' ? action.rootIdsBefore : action.rootIdsAfter
  const selection = direction === 'undo' ? action.selectionBefore : action.selectionAfter
  const arrowSel = direction === 'undo' ? action.arrowSelectionBefore : action.arrowSelectionAfter

  const storage = getStorage()

  // Apply note snapshots
  for (const [id, snapshot] of Object.entries(noteSnaps)) {
    if (snapshot === null) {
      // Delete
      notes.delete(id)
      await storage.deleteNotes([id])
    } else {
      const existing = notes.get(id)
      if (existing) {
        // Note exists → merge diff (or full snapshot) into it
        for (const [key, value] of Object.entries(snapshot)) {
          ;(existing as any)[key] = deepClone(value)
        }
        await persistNote(existing)
      } else if (history.isFullNote(snapshot)) {
        // Note doesn't exist → must be a full Note for create/restore
        const restored = deepClone(snapshot)
        notes.set(id, restored)
        await persistNote(restored)
      } else {
        console.warn(`[undo] Skipping partial snapshot for non-existent note: ${id}`)
      }
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

  // Rebuild parent map (undo/redo may have changed parent-child relationships)
  rebuildParentMap()

  // Recompute arrows since note positions/existence may have changed
  triggerArrowRecompute()
})

// ── Public API ──

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
  dragSessionNoteIds,

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
