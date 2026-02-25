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
