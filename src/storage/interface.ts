import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'
import type { Link } from '../types/link'
import type { Page, PageSummary } from '../types/page'

export interface StorageBackend {
  // Pages
  getPage(id: string): Promise<Page | undefined>
  savePage(page: Page): Promise<Page>
  deletePage(id: string): Promise<void>
  listPages(): Promise<PageSummary[]>

  // Notes
  getNote(id: string): Promise<Note | undefined>
  getNotes(ids: string[]): Promise<Note[]>
  saveNote(note: Note): Promise<Note>
  saveNotes(notes: Note[]): Promise<void>
  savePageBundle(page: Page, notes: Note[]): Promise<void>
  deleteNote(id: string): Promise<void>
  deleteNotes(ids: string[]): Promise<void>
  getNotesForPage(pageId: string): Promise<Note[]>

  // Arrows
  getArrow(id: string): Promise<Arrow | undefined>
  saveArrow(arrow: Arrow): Promise<Arrow>
  deleteArrow(id: string): Promise<void>
  deleteArrows(ids: string[]): Promise<void>
  getArrowsForPage(pageId: string): Promise<Arrow[]>

  // Links
  saveLink(link: Link): Promise<Link>
  deleteLink(id: string): Promise<void>
  deleteLinks(ids: string[]): Promise<void>
  getLinksForPage(pageId: string): Promise<Link[]>

  // Bulk
  exportAll(): Promise<{ pages: Page[]; notes: Note[]; arrows: Arrow[]; links: Link[] }>
  importAll(data: { pages: Page[]; notes: Note[]; arrows: Arrow[]; links?: Link[] }): Promise<void>

  // Vault
  getVaultPath(): string
}
