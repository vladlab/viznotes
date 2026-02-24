import type { JSONContent } from '@tiptap/vue-3'

export interface NoteTextSection {
  enabled: boolean
  content: JSONContent
  wrap: boolean
  height: string // 'auto' or pixel value like '200'
}

export interface NoteContainer {
  enabled: boolean
  spatial: boolean     // true = free positioning, false = list
  horizontal: boolean  // list direction when spatial=false
  stretchChildren: boolean
  childIds: string[]
}

export interface NoteColor {
  inherit: boolean
  value: string  // color name or hex
}

export interface Note {
  id: string
  pageId: string

  head: NoteTextSection
  body: NoteTextSection
  container: NoteContainer

  pos: { x: number; y: number }
  anchor: { x: number; y: number }
  width: string  // 'auto' or pixel value
  height: string // 'auto' or pixel value

  color: NoteColor
  link: string   // page ID, URL, or empty

  collapsed: boolean
  movable: boolean
  resizable: boolean

  zIndex: number

  createdAt: number
  updatedAt: number
}

export function createDefaultNote(
  pageId: string,
  pos: { x: number; y: number },
  overrides: Partial<Note> = {}
): Note {
  return {
    id: '',  // will be set by storage
    pageId,

    head: {
      enabled: true,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      wrap: true,
      height: 'auto',
    },
    body: {
      enabled: false,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      wrap: true,
      height: 'auto',
    },
    container: {
      enabled: false,
      spatial: false,
      horizontal: false,
      stretchChildren: true,
      childIds: [],
    },

    pos,
    anchor: { x: 0, y: 0 },
    width: 'auto',
    height: 'auto',

    color: { inherit: false, value: 'grey' },
    link: '',

    collapsed: false,
    movable: true,
    resizable: true,

    zIndex: 0,

    createdAt: Date.now(),
    updatedAt: Date.now(),

    ...overrides,
  }
}

// Available note color names — actual values come from CSS vars (--note-NAME)
export const NOTE_COLOR_NAMES = ['grey', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const

const NOTE_COLOR_FALLBACKS: Record<string, string> = {
  grey: '#4a4a4a', red: '#e03131', orange: '#e8590c', yellow: '#f08c00',
  green: '#2f9e44', cyan: '#0c8599', blue: '#1971c2', purple: '#7048e8', pink: '#c2255c',
}

/** Read a note color from the active theme's CSS variables */
export function getNoteColor(name: string): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue(`--note-${name}`).trim()
  return val || NOTE_COLOR_FALLBACKS[name] || '#4a4a4a'
}
