/**
 * AutoBody section management.
 *
 * Each named section in a note's autoBody is delimited by a bold marker
 * paragraph: "── SectionKey ──". This lets different data types (analysis,
 * file history, etc.) coexist independently with their own update semantics.
 */

import type { Note } from '../types/note'

const MARKER_PREFIX = '── '
const MARKER_SUFFIX = ' ──'

function makeMarkerText(key: string): string {
  return `${MARKER_PREFIX}${key}${MARKER_SUFFIX}`
}

/** Returns the section key if this block is a marker, else null. */
function parseMarker(block: any): string | null {
  const text = block?.content?.[0]?.text
  if (!text || typeof text !== 'string') return null
  if (text.startsWith(MARKER_PREFIX) && text.endsWith(MARKER_SUFFIX)) {
    return text.slice(MARKER_PREFIX.length, -MARKER_SUFFIX.length)
  }
  return null
}

function markerBlock(key: string): any {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: makeMarkerText(key), marks: [{ type: 'bold' }] }],
  }
}

/**
 * Find the [start, end) range of a named section within a blocks array.
 * start is the index of the marker paragraph.
 * end is the index of the next marker or end of array.
 */
function findSectionRange(blocks: any[], key: string): [number, number] | null {
  let start = -1
  for (let i = 0; i < blocks.length; i++) {
    const mk = parseMarker(blocks[i])
    if (mk === key) {
      start = i
    } else if (mk !== null && start >= 0) {
      return [start, i]
    }
  }
  if (start >= 0) return [start, blocks.length]
  return null
}

/** Get the content blocks of a named section (excluding the marker).
 *  Returns a mutable reference into the autoBody blocks array. */
export function getSectionBlocks(note: Note, key: string): any[] | null {
  const blocks = note.autoBody?.content?.content
  if (!blocks) return null
  const range = findSectionRange(blocks, key)
  if (!range) return null
  // Return slice after the marker (range[0]) up to end
  return blocks.slice(range[0] + 1, range[1])
}

/** Replace only the content blocks of a named section (keeps the marker). */
export function setSectionBlocks(note: Note, key: string, contentBlocks: any[]) {
  ensureAutoBody(note)
  const blocks = note.autoBody.content?.content ?? []
  const range = findSectionRange(blocks, key)
  if (range) {
    // Replace everything after marker up to end of section
    blocks.splice(range[0] + 1, range[1] - range[0] - 1, ...contentBlocks)
  } else {
    blocks.push(markerBlock(key), ...contentBlocks)
  }
  note.autoBody.content = { type: 'doc', content: blocks }
}

/** Strip leading empty paragraphs (TipTap doc initialization artifact). */
function stripLeadingEmpty(blocks: any[]): any[] {
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    if (b.type === 'paragraph' && (!b.content || b.content.length === 0)) {
      i++
    } else {
      break
    }
  }
  return i > 0 ? blocks.slice(i) : blocks
}

/** Replace an entire named section (creates it if missing). */
export function replaceAutoSection(note: Note, key: string, contentBlocks: any[]) {
  ensureAutoBody(note)
  let blocks = note.autoBody.content?.content ? [...note.autoBody.content.content] : []
  blocks = stripLeadingEmpty(blocks)
  const range = findSectionRange(blocks, key)
  const newSection = [markerBlock(key), ...contentBlocks]

  if (range) {
    blocks.splice(range[0], range[1] - range[0], ...newSection)
  } else {
    blocks.push(...newSection)
  }
  note.autoBody.content = { type: 'doc', content: blocks }
}

/** Append content to a named section (creates it if missing). */
export function appendAutoSection(note: Note, key: string, contentBlocks: any[]) {
  ensureAutoBody(note)
  let blocks = note.autoBody.content?.content ? [...note.autoBody.content.content] : []
  blocks = stripLeadingEmpty(blocks)
  const range = findSectionRange(blocks, key)

  if (range) {
    blocks.splice(range[1], 0, ...contentBlocks)
  } else {
    blocks.push(markerBlock(key), ...contentBlocks)
  }
  note.autoBody.content = { type: 'doc', content: blocks }
}

function ensureAutoBody(note: Note) {
  if (!note.autoBody) {
    note.autoBody = {
      enabled: false,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      wrap: true,
      height: 'auto',
    }
  }
  note.autoBody.enabled = true
}

/** Check if a note has visible autoBody content (markers, text, images). */
export function noteHasAutoBody(note: Note): boolean {
  const ab = note.autoBody
  if (!ab || !ab.enabled) return false  // Fast path: most notes
  const blocks = ab.content?.content
  if (!blocks || blocks.length === 0) return false
  // Check for any block with actual content (skip empty paragraphs)
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.type === 'image') return true
    if (b.content && b.content.length > 0) return true
  }
  return false
}
