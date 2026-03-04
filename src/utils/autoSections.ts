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

/** Replace an entire named section (creates it if missing). */
export function replaceAutoSection(note: Note, key: string, contentBlocks: any[]) {
  ensureAutoBody(note)
  const blocks = note.autoBody.content?.content ? [...note.autoBody.content.content] : []
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
  const blocks = note.autoBody.content?.content ? [...note.autoBody.content.content] : []
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
