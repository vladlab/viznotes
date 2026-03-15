/**
 * Ephemeral search results store.
 * Maps search note ID → array of matching note IDs.
 * Not persisted — cleared on page switch.
 */

import { reactive, watch } from 'vue'
import { appStore } from './app'
import { extractText } from '../utils/platform'
import type { Note } from '../types/note'

export const searchResults = reactive(new Map<string, string[]>())

export function clearSearchResults() {
  searchResults.clear()
}

// Clear on page switch
watch(() => appStore.currentPageId.value, () => {
  clearSearchResults()
})

/**
 * Run a fuzzy search across all notes on the current page.
 * Matches against head text, body text, autoBody text, file path, and node type.
 */
export function runSearch(searchNoteId: string, query: string) {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) {
    searchResults.set(searchNoteId, [])
    return
  }

  const terms = trimmed.split(/\s+/)
  const results: { id: string; score: number }[] = []

  for (const [id, note] of appStore.notes) {
    // Don't include search nodes in results
    if (note.nodeType === 'search') continue
    // Don't include the search node itself
    if (id === searchNoteId) continue
    // Scope to current page
    if (note.pageId !== appStore.currentPageId.value) continue

    const score = scoreNote(note, terms)
    if (score > 0) {
      results.push({ id, score })
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)
  searchResults.set(searchNoteId, results.map(r => r.id))
}

function scoreNote(note: Note, terms: string[]): number {
  // Build searchable text corpus
  const headText = extractText(note.head?.content).toLowerCase()
  const bodyText = note.body?.enabled ? extractText(note.body?.content).toLowerCase() : ''
  const autoBodyText = extractText(note.autoBody?.content).toLowerCase()
  const filePath = (note.link || '').toLowerCase()
  const nodeType = (note.nodeType || '').toLowerCase()

  let totalScore = 0
  for (const term of terms) {
    let termScore = 0

    // Head match is most valuable
    if (headText.includes(term)) termScore += 10
    // Body match
    if (bodyText.includes(term)) termScore += 5
    // AutoBody/file path
    if (autoBodyText.includes(term)) termScore += 3
    if (filePath.includes(term)) termScore += 3
    // Node type
    if (nodeType.includes(term)) termScore += 1

    // If any term has zero matches, the note doesn't match
    if (termScore === 0) return 0
    totalScore += termScore
  }

  return totalScore
}
