import type { JSONContent } from '@tiptap/vue-3'

// ── Node types ──

export interface NodeTypeInfo {
  label: string
  /** SVG path d-attribute, drawn in a 16x16 viewBox */
  icon: string
}

export const NODE_TYPES: Record<string, NodeTypeInfo> = {
  default: {
    label: '',
    icon: '',
  },
  note: {
    label: 'Note',
    icon: 'M4 2h8l4 4v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 2v4h4 M6 10h8 M6 14h8',
  },
  timeline: {
    label: 'Timeline',
    icon: 'M12 2v20 M5 6h4 M15 10h4 M5 14h4 M15 18h4',
  },
  file: {
    label: 'File',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  },
  status: {
    label: 'Status',
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
  },
} as const

export const NODE_TYPE_KEYS = Object.keys(NODE_TYPES) as (keyof typeof NODE_TYPES)[]

export interface NoteTextSection {
  enabled: boolean
  content: JSONContent
  wrap: boolean
  height: string // 'auto' or pixel value like '200'
}

export interface NoteContainer {
  enabled: boolean
  stretchChildren: boolean
  layout: 'list' | 'columns'
  childIds: string[]
}

export interface NoteColor {
  inherit: boolean
  value: string  // color name or hex
}

export interface NoteFoldState {
  autoBody: boolean  // true = section is folded/hidden
  body: boolean
  container: boolean
  links: boolean
}

export interface Note {
  id: string
  pageId: string

  head: NoteTextSection
  autoBody: NoteTextSection
  body: NoteTextSection
  container: NoteContainer

  pos: { x: number; y: number }
  anchor: { x: number; y: number }
  width: string  // 'auto' or pixel value
  height: string // 'auto' or pixel value

  color: NoteColor
  nodeType: string  // key from NODE_TYPES
  link: string   // page ID, URL, or empty
  fileSize?: number  // file size in bytes (for file-linked notes)

  collapsed: boolean
  foldState: NoteFoldState
  linkOrder: string[]  // ordered link IDs for display in Links section
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
    autoBody: {
      enabled: false,
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
      stretchChildren: true,
      layout: 'list',
      childIds: [],
    },

    pos,
    anchor: { x: 0, y: 0 },
    width: 'auto',
    height: 'auto',

    color: { inherit: false, value: 'grey' },
    nodeType: 'default',
    link: '',

    collapsed: false,
    foldState: { autoBody: false, body: false, container: false, links: false },
    linkOrder: [],
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
