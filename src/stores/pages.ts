/**
 * Page CRUD, navigation, and import/export operations.
 * Imports from state.ts and history.ts only.
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
  currentPageId,
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
} from './state'

// ── Page management ──

export async function loadPageList() {
  const storage = getStorage()
  pageList.value = await storage.listPages()
}

export async function loadPage(pageId: string) {
  const storage = getStorage()

  // Flush any pending saves from the current page before switching
  await flushPendingSaves()

  loading.value = true
  editingNoteId.value = null
  setEditStartSnapshot(null)
  selectedNoteIds.clear()
  history.clear()

  try {
    const page = await storage.getPage(pageId)
    if (!page) return

    const pageNotes = await storage.getNotesForPage(pageId)
    const pageArrows = await storage.getArrowsForPage(pageId)
    const pageLinks = await storage.getLinksForPage(pageId)
    notes.clear()
    arrows.clear()
    links.clear()
    for (const note of pageNotes) {
      notes.set(note.id, note)
    }
    for (const arrow of pageArrows) {
      arrows.set(arrow.id, arrow)
    }
    for (const link of pageLinks) {
      links.set(link.id, link)
    }

    currentPage.value = page
    currentPageId.value = pageId
    rebuildParentMap()

    // Compact z-indexes: renumber to sequential 1,2,3… preserving order
    const sorted = [...notes.values()].sort((a, b) => a.zIndex - b.zIndex)
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].zIndex = i + 1
    }
    if (currentPage.value) {
      currentPage.value.nextZIndex = sorted.length + 1
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
  if (pushHistory && currentPageId.value) {
    pageHistory.value.push(currentPageId.value)
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
      links.clear()
      history.clear()
    }
  }
}

export async function renamePage(pageId: string, title: string) {
  const storage = getStorage()
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

export async function exportData() {
  const storage = getStorage()
  return storage.exportAll()
}

export async function importData(data: { pages: Page[]; notes: Note[]; arrows: Arrow[]; links?: any[] }) {
  const storage = getStorage()
  await storage.importAll(data)
  await loadPageList()
  if (currentPageId.value) await loadPage(currentPageId.value)
}
