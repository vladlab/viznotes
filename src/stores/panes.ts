/**
 * Pane management for split-view support.
 *
 * Each pane has its own: selection state, editing state, and page reference.
 * Shared across panes: notes/arrows/links Maps, storage, undo stack.
 *
 * The "active" pane determines which selection/editing globals are in effect.
 * Existing store code reads/writes those globals unchanged — we just swap
 * the backing data when the active pane changes.
 */

import { reactive, ref, computed } from 'vue'
import type { Note } from '../types/note'
import { nanoid } from 'nanoid'

// ── Pane context ──

export interface PaneContext {
  id: string
  pageId: string | null
  selectedNoteIds: Set<string>
  selectedArrowIds: Set<string>
  editingNoteId: string | null
  editStartSnapshot: Note | null
}

function createPaneContext(pageId: string | null = null): PaneContext {
  return {
    id: nanoid(8),
    pageId,
    selectedNoteIds: new Set(),
    selectedArrowIds: new Set(),
    editingNoteId: null,
    editStartSnapshot: null,
  }
}

// ── Reactive state ──

export const panes = reactive(new Map<string, PaneContext>())
export const activePaneId = ref<string | null>(null)
export const splitActive = ref(false)

export const activePane = computed<PaneContext | null>(() => {
  if (!activePaneId.value) return null
  return panes.get(activePaneId.value) ?? null
})

/** All page IDs currently loaded across panes */
export const loadedPageIds = computed<Set<string>>(() => {
  const ids = new Set<string>()
  for (const pane of panes.values()) {
    if (pane.pageId) ids.add(pane.pageId)
  }
  return ids
})

/** How many panes reference a given pageId */
export function paneCountForPage(pageId: string): number {
  let count = 0
  for (const pane of panes.values()) {
    if (pane.pageId === pageId) count++
  }
  return count
}

/** Get the "other" pane (for 2-pane split). Returns null if only one pane. */
export function getOtherPane(paneId: string): PaneContext | null {
  for (const pane of panes.values()) {
    if (pane.id !== paneId) return pane
  }
  return null
}

// ── Pane lifecycle ──

/** Create the initial primary pane. Called once at app startup. */
export function initPrimaryPane(pageId: string | null = null): PaneContext {
  const pane = createPaneContext(pageId)
  panes.set(pane.id, pane)
  activePaneId.value = pane.id
  return pane
}

/** Open a new split pane. Returns the new pane. */
export function openSplitPane(pageId: string | null = null): PaneContext {
  const pane = createPaneContext(pageId)
  panes.set(pane.id, pane)
  splitActive.value = true
  return pane
}

/** Close a split pane by ID. Returns the page ID it had (for cleanup). */
export function closeSplitPane(paneId: string): string | null {
  const pane = panes.get(paneId)
  if (!pane) return null
  const pageId = pane.pageId
  panes.delete(paneId)
  splitActive.value = panes.size > 1

  // If we closed the active pane, activate another
  if (activePaneId.value === paneId) {
    const remaining = panes.values().next().value
    activePaneId.value = remaining ? remaining.id : null
  }

  return pageId
}

/** Set a pane's page. Returns the old pageId for unload checks. */
export function setPanePage(paneId: string, pageId: string): string | null {
  const pane = panes.get(paneId)
  if (!pane) return null
  const oldPageId = pane.pageId

  // Clear pane-local state when switching pages
  pane.selectedNoteIds.clear()
  pane.selectedArrowIds.clear()
  pane.editingNoteId = null
  pane.editStartSnapshot = null
  pane.pageId = pageId

  return oldPageId
}

/** Switch active pane focus */
export function setActivePane(paneId: string) {
  if (panes.has(paneId)) {
    activePaneId.value = paneId
  }
}

/** Get ordered array of panes (for rendering) */
export function orderedPanes(): PaneContext[] {
  return Array.from(panes.values())
}

export { createPaneContext }
