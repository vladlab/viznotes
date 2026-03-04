/**
 * Link CRUD operations.
 * Many-to-many relationships between notes on the same page.
 */

import type { Link } from '../types/link'
import { createDefaultLink } from '../types/link'
import { computed } from 'vue'
import { history } from './history'
import {
  links,
  currentPage,
  selectedNoteIds,
  selectedArrowIds,
  linkingSourceId,
  selectionArray,
  deepClone,
  getStorage,
} from './state'

/** Indexed map from noteId → links involving that note. Rebuilt once per links change. */
const linkIndex = computed(() => {
  const idx = new Map<string, Link[]>()
  for (const link of links.values()) {
    let a = idx.get(link.noteIdA)
    if (!a) { a = []; idx.set(link.noteIdA, a) }
    a.push(link)

    let b = idx.get(link.noteIdB)
    if (!b) { b = []; idx.set(link.noteIdB, b) }
    b.push(link)
  }
  return idx
})

/** Get all links involving a given note. */
export function getLinksForNote(noteId: string): Link[] {
  return linkIndex.value.get(noteId) || []
}

/** Get the ID of the "other" note in a link. */
export function linkedNoteId(link: Link, fromNoteId: string): string {
  return link.noteIdA === fromNoteId ? link.noteIdB : link.noteIdA
}

/** Check if a link already exists between two notes (either direction). */
export function linkExists(noteIdA: string, noteIdB: string): boolean {
  for (const link of links.values()) {
    if (
      (link.noteIdA === noteIdA && link.noteIdB === noteIdB) ||
      (link.noteIdA === noteIdB && link.noteIdB === noteIdA)
    ) {
      return true
    }
  }
  return false
}

/** Create a link between two notes. */
export async function createLink(noteIdA: string, noteIdB: string): Promise<Link | null> {
  if (!currentPage.value) return null
  if (noteIdA === noteIdB) return null
  if (linkExists(noteIdA, noteIdB)) return null

  const storage = getStorage()
  const link = createDefaultLink(currentPage.value.id, noteIdA, noteIdB)
  const saved = await storage.saveLink(link)
  links.set(saved.id, saved)

  history.pushAction({
    description: 'Create link',
    pageId: currentPage.value?.id ?? '',
    notesBefore: {},
    notesAfter: {},
    linksBefore: { [saved.id]: null },
    linksAfter: { [saved.id]: deepClone(saved) },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: selectionArray(),
    selectionAfter: selectionArray(),
  })

  return saved
}

/** Delete a link by ID. */
export async function deleteLink(linkId: string) {
  const storage = getStorage()
  const link = links.get(linkId)
  if (!link) return

  links.delete(linkId)
  await storage.deleteLink(linkId)

  history.pushAction({
    description: 'Delete link',
    pageId: currentPage.value?.id ?? '',
    notesBefore: {},
    notesAfter: {},
    linksBefore: { [linkId]: deepClone(link) },
    linksAfter: { [linkId]: null },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: selectionArray(),
    selectionAfter: selectionArray(),
  })
}

/** Delete all links involving a given note. No undo entry — called as part of note deletion. */
export async function deleteLinksForNote(noteId: string) {
  const storage = getStorage()
  const toDelete: string[] = []
  for (const link of links.values()) {
    if (link.noteIdA === noteId || link.noteIdB === noteId) {
      toDelete.push(link.id)
    }
  }
  for (const id of toDelete) links.delete(id)
  if (toDelete.length > 0) await storage.deleteLinks(toDelete)
}

/** Enter linking mode — next click on a note creates the link. */
export function startLinking(sourceNoteId: string) {
  linkingSourceId.value = sourceNoteId
}

/** Cancel linking mode. */
export function cancelLinking() {
  linkingSourceId.value = null
}

/** Complete linking mode — called when user clicks a target note. */
export async function completeLinking(targetNoteId: string) {
  const sourceId = linkingSourceId.value
  linkingSourceId.value = null
  if (!sourceId) return
  await createLink(sourceId, targetNoteId)
}
