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
  loadedPages,
  notes,
  arrows,
  links,
  linkingSourceId,
  focusNoteId,
  pageList,
  pageHistory,
  loading,
  selectedNoteIds,
  selectedArrowIds,
  editingNoteId,
  setArrowRecompute,
  clearArrowRecompute,
  triggerArrowRecompute,
  recomputeArrowsSync,
  dragNoteSizeCache,
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
  dropInsertParentId,
  dropInsertIndex,
  getRootNotesForPage,
  getRootIdsForPage,
} from './state'

// ── Panes ──
import {
  panes,
  activePaneId,
  activePane,
  splitActive,
  loadedPageIds,
  paneCountForPage,
  getOtherPane,
  initPrimaryPane,
  openSplitPane,
  closeSplitPane,
  setPanePage,
  setActivePane,
  orderedPanes,
} from './panes'

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
  reorderNote,
} from './notes'

// ── Arrows ──
import {
  getArrowsForNote,
  createArrow,
  updateArrow,
  deleteArrow,
  deleteSelectedArrows,
} from './arrows'

// ── Clipboard ──
import {
  copySelected,
  hasClipboard,
  pasteNotes,
  duplicateNotes,
} from './clipboard'

// ── Generators ──
import { generateWeek } from './generators'

// ── Links ──
import {
  getLinksForNote,
  linkedNoteId,
  linkExists,
  createLink,
  deleteLink,
  startLinking,
  cancelLinking,
  completeLinking,
} from './links'

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
// Multi-page aware: uses loadedPages to find the right page for rootIds.

history.setApplySnapshot(async (action, direction) => {
  const noteSnaps = direction === 'undo' ? action.notesBefore : action.notesAfter
  const arrowSnaps = direction === 'undo' ? action.arrowsBefore : action.arrowsAfter
  const linkSnaps = direction === 'undo' ? action.linksBefore : action.linksAfter
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
      const existing = notes.get(id)
      if (existing) {
        for (const [key, value] of Object.entries(snapshot)) {
          ;(existing as any)[key] = deepClone(value)
        }
        await persistNote(existing)
      } else if (history.isFullNote(snapshot)) {
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

  // Clean up orphaned arrows
  const orphanedIds: string[] = []
  for (const [id, arrow] of arrows) {
    if (!notes.has(arrow.sourceNoteId) || !notes.has(arrow.targetNoteId)) {
      orphanedIds.push(id)
    }
  }
  if (orphanedIds.length > 0) {
    for (const id of orphanedIds) {
      arrows.delete(id)
      selectedArrowIds.delete(id)
    }
    await storage.deleteArrows(orphanedIds)
  }

  // Apply link snapshots
  for (const [id, snapshot] of Object.entries(linkSnaps)) {
    if (snapshot === null) {
      links.delete(id)
      await storage.deleteLink(id)
    } else {
      const restored = deepClone(snapshot)
      links.set(id, restored)
      await storage.saveLink(restored)
    }
  }

  // Clean up orphaned links
  const orphanedLinkIds: string[] = []
  for (const [id, link] of links) {
    if (!notes.has(link.noteIdA) || !notes.has(link.noteIdB)) {
      orphanedLinkIds.push(id)
    }
  }
  if (orphanedLinkIds.length > 0) {
    for (const id of orphanedLinkIds) links.delete(id)
    await storage.deleteLinks(orphanedLinkIds)
  }

  // Apply root IDs — use the action's pageId to find the right page
  if (rootIds !== null) {
    const page = loadedPages.get(action.pageId)
    if (page) {
      page.rootNoteIds = [...rootIds]
      await persistPage(page)
    }
  }

  // Restore selection — route to the pane that owns this page
  const targetPane = (() => {
    for (const p of panes.values()) {
      if (p.pageId === action.pageId) return p
    }
    return null
  })()

  if (targetPane && targetPane.id === activePaneId.value) {
    // Active pane — update globals directly
    selectedNoteIds.clear()
    selectedArrowIds.clear()
    for (const id of selection) {
      if (notes.has(id)) selectedNoteIds.add(id)
    }
    for (const id of arrowSel) {
      if (arrows.has(id)) selectedArrowIds.add(id)
    }
    editingNoteId.value = null
  } else if (targetPane) {
    // Different pane — update its context directly (don't touch active pane globals)
    targetPane.selectedNoteIds = new Set(selection.filter(id => notes.has(id)))
    targetPane.selectedArrowIds = new Set(arrowSel.filter(id => arrows.has(id)))
    targetPane.editingNoteId = null
    targetPane.editStartSnapshot = null
  }

  rebuildParentMap()
  triggerArrowRecompute()
})

// ── Public API ──

export const appStore = {
  // Init
  setStorage,

  // State
  currentPageId,
  currentPage,
  loadedPages,
  notes,
  arrows,
  pageList,
  pageHistory,
  loading,
  selectedNoteIds,
  selectedArrowIds,
  editingNoteId,
  setArrowRecompute,
  clearArrowRecompute,
  triggerArrowRecompute,
  recomputeArrowsSync,
  dragSessionNoteIds,
  dragNoteSizeCache,
  dropInsertParentId,
  dropInsertIndex,

  // Computed
  rootNotes,
  selectedNotes,
  getRootNotesForPage,
  getRootIdsForPage,

  // Panes
  panes,
  activePaneId,
  activePane,
  splitActive,
  loadedPageIds,
  paneCountForPage,
  getOtherPane,
  initPrimaryPane,
  openSplitPane,
  closeSplitPane,
  setPanePage,
  setActivePane,
  orderedPanes,

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
  reorderNote,
  findParent,

  // Arrows
  getArrowsForNote,
  createArrow,
  updateArrow,
  deleteArrow,
  deleteSelectedArrows,

  // Clipboard
  copySelected,
  hasClipboard,
  pasteNotes,
  duplicateNotes,

  // Data
  exportData,
  importData,

  // Generators
  generateWeek,

  // Links
  links,
  linkingSourceId,
  focusNoteId,
  getLinksForNote,
  linkedNoteId,
  linkExists,
  createLink,
  deleteLink,
  startLinking,
  cancelLinking,
  completeLinking,

  // History
  undo: history.undo,
  redo: history.redo,
  canUndo: history.canUndo,
  canRedo: history.canRedo,
}
