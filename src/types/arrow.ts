export type AnchorSide = 'top' | 'bottom' | 'left' | 'right'

export interface Arrow {
  id: string
  pageId: string
  sourceNoteId: string
  targetNoteId: string
  sourceAnchor: AnchorSide
  targetAnchor: AnchorSide
  color: string
  dashed: boolean
  createdAt: number
  updatedAt: number
}

export function createDefaultArrow(
  pageId: string,
  sourceNoteId: string,
  targetNoteId: string,
  sourceAnchor: AnchorSide = 'right',
  targetAnchor: AnchorSide = 'left',
): Arrow {
  return {
    id: '',
    pageId,
    sourceNoteId,
    targetNoteId,
    sourceAnchor,
    targetAnchor,
    color: 'default',
    dashed: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/** Get the outward-facing unit direction for each side */
export function anchorDirection(side: AnchorSide): { dx: number; dy: number } {
  switch (side) {
    case 'top': return { dx: 0, dy: -1 }
    case 'bottom': return { dx: 0, dy: 1 }
    case 'left': return { dx: -1, dy: 0 }
    case 'right': return { dx: 1, dy: 0 }
  }
}
