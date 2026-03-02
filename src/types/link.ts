export interface Link {
  id: string
  pageId: string
  noteIdA: string
  noteIdB: string
  createdAt: number
}

export function createDefaultLink(
  pageId: string,
  noteIdA: string,
  noteIdB: string,
): Link {
  return {
    id: '',
    pageId,
    noteIdA,
    noteIdB,
    createdAt: Date.now(),
  }
}
