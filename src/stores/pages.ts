/**
 * Page CRUD, navigation, and import/export operations.
 * Supports split-view: multiple pages can be loaded simultaneously.
 */

import { toRaw } from 'vue'
import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'
import type { Page } from '../types/page'
import { createDefaultPage } from '../types/page'
import { history } from './history'
import {
  notes,
  arrows,
  links,
  loadedPages,
  currentPage,
  pageList,
  pageHistory,
  loading,
  selectedNoteIds,
  editingNoteId,
  setEditStartSnapshot,
  flushPendingSaves,
  getStorage,
  rebuildParentMap,
  loadPageData,
  unloadPageData,
} from './state'
import {
  activePane,
  activePaneId,
  panes,
  paneCountForPage,
  setPanePage,
} from './panes'

// ── Page management ──

export async function loadPageList() {
  const storage = getStorage()
  pageList.value = await storage.listPages()
}

/**
 * Load a page into the active pane.
 * Additive: other pane's data stays in shared Maps.
 */
export async function loadPage(pageId: string, targetPaneId?: string) {
  const storage = getStorage()
  const paneId = targetPaneId ?? activePaneId.value
  if (!paneId) return

  const pane = panes.get(paneId)
  if (!pane) return

  // Flush any pending saves before switching
  await flushPendingSaves()

  loading.value = true
  editingNoteId.value = null
  setEditStartSnapshot(null)
  selectedNoteIds.clear()

  try {
    // If this pane had a different page, unload it (if no other pane uses it)
    const oldPageId = setPanePage(paneId, pageId)
    if (oldPageId && oldPageId !== pageId && paneCountForPage(oldPageId) === 0) {
      unloadPageData(oldPageId)
      // Purge undo history for the old page since it's no longer open
      history.purgePageActions(oldPageId)
    }

    // If this page is already loaded (another pane has it), just point to it
    if (loadedPages.has(pageId)) {
      rebuildParentMap()
    } else {
      // Load fresh from storage
      const page = await storage.getPage(pageId)
      if (!page) return

      const pageNotes = await storage.getNotesForPage(pageId)
      const pageArrows = await storage.getArrowsForPage(pageId)
      const pageLinks = await storage.getLinksForPage(pageId)

      loadPageData(page, pageNotes, pageArrows, pageLinks)

      // Compact z-indexes for this page's notes
      const sorted = pageNotes.sort((a, b) => a.zIndex - b.zIndex)
      for (let i = 0; i < sorted.length; i++) {
        sorted[i].zIndex = i + 1
      }
      if (page) {
        page.nextZIndex = sorted.length + 1
      }
    }
  } finally {
    loading.value = false
  }
}

export async function createPage(title: string = 'Untitled'): Promise<Page> {
  const storage = getStorage()
  const page = await storage.savePage(createDefaultPage({ title }))
  await loadPageList()
  return page
}

export async function navigateToPage(pageId: string, pushHistory = true) {
  if (pushHistory && currentPage.value) {
    pageHistory.value.push(currentPage.value.id)
  } else if (!pushHistory) {
    pageHistory.value = []
  }
  await loadPage(pageId)
}

export async function navigateBack() {
  const prevId = pageHistory.value.pop()
  if (prevId) await loadPage(prevId)
}

export async function deletePage(pageId: string) {
  const storage = getStorage()

  // Check if this page is open in any pane
  const isLoaded = loadedPages.has(pageId)

  // Clean up note links pointing to this page across ALL pages
  const allPages = await storage.listPages()
  for (const pageSummary of allPages) {
    if (pageSummary.id === pageId) continue
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

  // If loaded, unload data and redirect any panes that had it
  if (isLoaded) {
    unloadPageData(pageId)
    history.purgePageActions(pageId)
  }

  await storage.deletePage(pageId)
  await loadPageList()

  // Redirect any panes that were showing this page
  for (const pane of panes.values()) {
    if (pane.pageId === pageId) {
      if (pageList.value.length > 0) {
        await loadPage(pageList.value[0].id, pane.id)
      } else {
        setPanePage(pane.id, '')
      }
    }
  }
}

export async function renamePage(pageId: string, title: string) {
  const storage = getStorage()
  // Check if page is loaded in memory first
  const loadedPage = loadedPages.get(pageId)
  if (loadedPage) {
    loadedPage.title = title
    await storage.savePage(loadedPage)
  } else {
    const page = await storage.getPage(pageId)
    if (page) {
      page.title = title
      await storage.savePage(page)
    }
  }
  await loadPageList()
}

export async function exportData() {
  const storage = getStorage()
  return storage.exportAll()
}

export async function importData(data: { pages: Page[]; notes: Note[]; arrows: Arrow[]; links?: any[] }) {
  const storage = getStorage()
  await storage.importAll(data)
  await loadPageList()
  // Reload the active pane's page
  const pane = activePane.value
  if (pane?.pageId) await loadPage(pane.pageId)
}
