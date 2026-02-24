export interface Page {
  id: string
  title: string
  rootNoteIds: string[]  // ordered list of top-level note IDs
  nextZIndex: number
  createdAt: number
  updatedAt: number
}

export interface PageSummary {
  id: string
  title: string
  updatedAt: number
}

export function createDefaultPage(overrides: Partial<Page> = {}): Page {
  return {
    id: '',  // set by storage
    title: 'Untitled',
    rootNoteIds: [],
    nextZIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}
