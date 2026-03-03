/**
 * File-based StorageBackend for Tauri.
 * Uses Rust invoke commands for all I/O — no fs plugin needed.
 */

import type { StorageBackend } from './interface'
import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'
import type { Link } from '../types/link'
import type { Page, PageSummary } from '../types/page'
import { nanoid } from 'nanoid'

let _invoke: any = null

async function getInvoke() {
  if (!_invoke) {
    const mod = await import('@tauri-apps/api/core')
    _invoke = mod.invoke
  }
  return _invoke
}

async function exists(path: string): Promise<boolean> {
  return (await getInvoke())('path_exists', { path })
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await (await getInvoke())('read_text_file', { path })
  return JSON.parse(raw)
}

async function writeJson(path: string, data: any): Promise<void> {
  await (await getInvoke())('write_text_file', { path, contents: JSON.stringify(data, null, 2) })
}

async function ensureDir(path: string): Promise<void> {
  await (await getInvoke())('ensure_dir', { path })
}

async function removeFile(path: string): Promise<void> {
  await (await getInvoke())('remove_file', { path })
}

async function listDir(path: string): Promise<string[]> {
  return (await getInvoke())('list_dir', { path })
}

interface MetaFile { version: 1; pages: PageSummary[] }
interface PageFile { page: Page; notes: Note[]; arrows: Arrow[]; links: Link[] }

export class FileStorage implements StorageBackend {
  private vaultPath: string
  private meta: MetaFile = { version: 1, pages: [] }
  private pageCache = new Map<string, PageFile>()

  constructor(vaultPath: string) { this.vaultPath = vaultPath }

  async init(): Promise<void> {
    await ensureDir(this.vaultPath)
    await ensureDir(`${this.vaultPath}/pages`)

    const metaPath = `${this.vaultPath}/meta.json`
    if (await exists(metaPath)) {
      try {
        this.meta = await readJson<MetaFile>(metaPath)
        console.log(`[FileStorage] Loaded ${this.meta.pages.length} pages from ${this.vaultPath}`)
      } catch (e) {
        console.error('[FileStorage] Corrupt meta.json, attempting recovery:', e)
        this.meta = { version: 1, pages: [] }
        try {
          const files = await listDir(`${this.vaultPath}/pages`)
          for (const file of files) {
            if (!file.endsWith('.json')) continue
            const pageId = file.replace('.json', '')
            try {
              const data = await readJson<PageFile>(this.pageFilePath(pageId))
              if (data?.page) {
                this.pageCache.set(pageId, data)
                this.meta.pages.push({
                  id: data.page.id,
                  title: data.page.title,
                  updatedAt: data.page.updatedAt,
                })
              }
            } catch { /* skip unreadable page files */ }
          }
          console.log(`[FileStorage] Recovered ${this.meta.pages.length} pages from disk`)
        } catch (scanErr) {
          console.error('[FileStorage] Could not scan pages directory:', scanErr)
        }
        await this.writeMeta()
      }
    } else {
      this.meta = { version: 1, pages: [] }
      await this.writeMeta()
      console.log(`[FileStorage] Created new vault at ${this.vaultPath}`)
    }
  }

  private async writeMeta() { await writeJson(`${this.vaultPath}/meta.json`, this.meta) }
  private pageFilePath(id: string) { return `${this.vaultPath}/pages/${id}.json` }

  private async readPageFile(pageId: string): Promise<PageFile | null> {
    const cached = this.pageCache.get(pageId)
    if (cached) return cached
    try {
      if (!(await exists(this.pageFilePath(pageId)))) return null
      const data = await readJson<PageFile>(this.pageFilePath(pageId))
      if (!data.links) data.links = []  // backward compat
      this.pageCache.set(pageId, data)
      return data
    } catch (e) {
      console.error(`[FileStorage] Failed to read page ${pageId}:`, e)
      return null
    }
  }

  private async writePageFile(pageId: string, data: PageFile) {
    this.pageCache.set(pageId, data)
    await writeJson(this.pageFilePath(pageId), data)
  }

  private async ensurePageFile(pageId: string): Promise<PageFile> {
    const existing = await this.readPageFile(pageId)
    if (existing) return existing
    const empty: PageFile = {
      page: { id: pageId, title: 'Untitled', rootNoteIds: [], nextZIndex: 0, createdAt: Date.now(), updatedAt: Date.now() },
      notes: [], arrows: [], links: [],
    }
    await this.writePageFile(pageId, empty)
    return empty
  }

  async getPage(id: string) { return (await this.readPageFile(id))?.page }

  async savePage(page: Page): Promise<Page> {
    if (!page.id) page.id = nanoid()
    page.updatedAt = Date.now()
    const file = (await this.readPageFile(page.id)) || { page, notes: [], arrows: [], links: [] }
    file.page = page
    await this.writePageFile(page.id, file)
    const idx = this.meta.pages.findIndex(p => p.id === page.id)
    const summary: PageSummary = { id: page.id, title: page.title, updatedAt: page.updatedAt }
    if (idx >= 0) this.meta.pages[idx] = summary; else this.meta.pages.push(summary)
    await this.writeMeta()
    return page
  }

  async deletePage(id: string) {
    this.pageCache.delete(id)
    this.meta.pages = this.meta.pages.filter(p => p.id !== id)
    await this.writeMeta()
    try { await removeFile(this.pageFilePath(id)) } catch {}
  }

  async listPages(): Promise<PageSummary[]> {
    return [...this.meta.pages].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async getNote(id: string) {
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); const n = f?.notes.find(n => n.id === id); if (n) return n }
  }

  async getNotes(ids: string[]) {
    const idSet = new Set(ids); const results: Note[] = []
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); if (!f) continue; for (const n of f.notes) { if (idSet.delete(n.id)) results.push(n) }; if (!idSet.size) break }
    return results
  }

  async saveNote(note: Note): Promise<Note> {
    if (!note.id) note.id = nanoid()
    note.updatedAt = Date.now()
    const file = await this.ensurePageFile(note.pageId)
    const idx = file.notes.findIndex(n => n.id === note.id)
    if (idx >= 0) file.notes[idx] = note; else file.notes.push(note)
    await this.writePageFile(note.pageId, file)
    return note
  }

  async saveNotes(notes: Note[]) {
    const now = Date.now(); for (const n of notes) { if (!n.id) n.id = nanoid(); n.updatedAt = now }
    const byPage = new Map<string, Note[]>()
    for (const n of notes) { const l = byPage.get(n.pageId) || []; l.push(n); byPage.set(n.pageId, l) }
    for (const [pid, pn] of byPage) { const f = await this.ensurePageFile(pid); for (const n of pn) { const i = f.notes.findIndex(x => x.id === n.id); if (i >= 0) f.notes[i] = n; else f.notes.push(n) }; await this.writePageFile(pid, f) }
  }

  async savePageBundle(page: Page, notes: Note[]) {
    if (!page.id) page.id = nanoid()
    const now = Date.now()
    page.updatedAt = now
    for (const n of notes) { if (!n.id) n.id = nanoid(); n.updatedAt = now }

    // Read the page file once, apply both page metadata and note updates
    const file = await this.ensurePageFile(page.id)
    file.page = page
    for (const n of notes) {
      const i = file.notes.findIndex(x => x.id === n.id)
      if (i >= 0) file.notes[i] = n; else file.notes.push(n)
    }

    // Single atomic write for both page + notes
    await this.writePageFile(page.id, file)

    // Update meta summary
    const idx = this.meta.pages.findIndex(p => p.id === page.id)
    const summary: PageSummary = { id: page.id, title: page.title, updatedAt: page.updatedAt }
    if (idx >= 0) this.meta.pages[idx] = summary; else this.meta.pages.push(summary)
    await this.writeMeta()
  }

  async deleteNote(id: string) {
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); if (!f) continue; const i = f.notes.findIndex(n => n.id === id); if (i >= 0) { f.notes.splice(i, 1); await this.writePageFile(ps.id, f); return } }
  }

  async deleteNotes(ids: string[]) {
    const idSet = new Set(ids)
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); if (!f) continue; const b = f.notes.length; f.notes = f.notes.filter(n => !idSet.has(n.id)); if (f.notes.length !== b) await this.writePageFile(ps.id, f) }
  }

  async getNotesForPage(pageId: string) { return (await this.readPageFile(pageId))?.notes || [] }

  async getArrow(id: string) {
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); const a = f?.arrows.find(a => a.id === id); if (a) return a }
  }

  async saveArrow(arrow: Arrow): Promise<Arrow> {
    if (!arrow.id) arrow.id = nanoid()
    arrow.updatedAt = Date.now()
    const file = await this.ensurePageFile(arrow.pageId)
    const idx = file.arrows.findIndex(a => a.id === arrow.id)
    if (idx >= 0) file.arrows[idx] = arrow; else file.arrows.push(arrow)
    await this.writePageFile(arrow.pageId, file)
    return arrow
  }

  async deleteArrow(id: string) {
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); if (!f) continue; const i = f.arrows.findIndex(a => a.id === id); if (i >= 0) { f.arrows.splice(i, 1); await this.writePageFile(ps.id, f); return } }
  }

  async deleteArrows(ids: string[]) {
    const idSet = new Set(ids)
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); if (!f) continue; const b = f.arrows.length; f.arrows = f.arrows.filter(a => !idSet.has(a.id)); if (f.arrows.length !== b) await this.writePageFile(ps.id, f) }
  }

  async getArrowsForPage(pageId: string) { return (await this.readPageFile(pageId))?.arrows || [] }

  // Links
  async saveLink(link: Link): Promise<Link> {
    if (!link.id) link.id = nanoid()
    const file = await this.ensurePageFile(link.pageId)
    const idx = file.links.findIndex(l => l.id === link.id)
    if (idx >= 0) file.links[idx] = link; else file.links.push(link)
    await this.writePageFile(link.pageId, file)
    return link
  }

  async deleteLink(id: string) {
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); if (!f) continue; const i = f.links.findIndex(l => l.id === id); if (i >= 0) { f.links.splice(i, 1); await this.writePageFile(ps.id, f); return } }
  }

  async deleteLinks(ids: string[]) {
    const idSet = new Set(ids)
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); if (!f) continue; const b = f.links.length; f.links = f.links.filter(l => !idSet.has(l.id)); if (f.links.length !== b) await this.writePageFile(ps.id, f) }
  }

  async getLinksForPage(pageId: string) { return (await this.readPageFile(pageId))?.links || [] }

  async exportAll() {
    const pages: Page[] = [], notes: Note[] = [], arrows: Arrow[] = [], links: Link[] = []
    for (const ps of this.meta.pages) { const f = await this.readPageFile(ps.id); if (!f) continue; pages.push(f.page); notes.push(...f.notes); arrows.push(...f.arrows); links.push(...f.links) }
    return { pages, notes, arrows, links }
  }

  async importAll(data: { pages: Page[]; notes: Note[]; arrows: Arrow[]; links?: Link[] }) {
    for (const ps of this.meta.pages) { try { await removeFile(this.pageFilePath(ps.id)) } catch {} }
    this.pageCache.clear()
    const notesByPage = new Map<string, Note[]>(); const arrowsByPage = new Map<string, Arrow[]>(); const linksByPage = new Map<string, Link[]>()
    for (const n of data.notes) { const l = notesByPage.get(n.pageId) || []; l.push(n); notesByPage.set(n.pageId, l) }
    for (const a of data.arrows) { const l = arrowsByPage.get(a.pageId) || []; l.push(a); arrowsByPage.set(a.pageId, l) }
    for (const lk of (data.links || [])) { const l = linksByPage.get(lk.pageId) || []; l.push(lk); linksByPage.set(lk.pageId, l) }
    const summaries: PageSummary[] = []
    for (const page of data.pages) {
      await this.writePageFile(page.id, { page, notes: notesByPage.get(page.id) || [], arrows: arrowsByPage.get(page.id) || [], links: linksByPage.get(page.id) || [] })
      summaries.push({ id: page.id, title: page.title, updatedAt: page.updatedAt })
    }
    this.meta = { version: 1, pages: summaries }; await this.writeMeta()
  }

  getVaultPath() { return this.vaultPath }
}
