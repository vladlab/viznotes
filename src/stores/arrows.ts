/**
 * Arrow CRUD operations.
 * Imports from state.ts and history.ts only.
 */

import type { Arrow, AnchorSide } from '../types/arrow'
import { createDefaultArrow } from '../types/arrow'
import { history } from './history'
import {
  arrows,
  currentPage,
  selectedNoteIds,
  selectedArrowIds,
  selectionArray,
  deepClone,
  getStorage,
} from './state'

export function getArrowsForNote(noteId: string): Arrow[] {
  const result: Arrow[] = []
  for (const arrow of arrows.values()) {
    if (arrow.sourceNoteId === noteId || arrow.targetNoteId === noteId) {
      result.push(arrow)
    }
  }
  return result
}

export async function createArrow(
  sourceNoteId: string,
  targetNoteId: string,
  sourceAnchor: AnchorSide = 'right',
  targetAnchor: AnchorSide = 'left',
): Promise<Arrow> {
  if (!currentPage.value) throw new Error('No page loaded')

  const storage = getStorage()
  const arrow = createDefaultArrow(currentPage.value.id, sourceNoteId, targetNoteId, sourceAnchor, targetAnchor)
  const saved = await storage.saveArrow(arrow)
  arrows.set(saved.id, saved)

  // Undo
  history.pushAction({
    description: 'Create arrow',
    pageId: currentPage.value?.id ?? '',
    notesBefore: {},
    notesAfter: {},
    arrowsBefore: { [saved.id]: null },
    arrowsAfter: { [saved.id]: deepClone(saved) },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: selectionArray(),
    selectionAfter: selectionArray(),
    arrowSelectionBefore: [],
    arrowSelectionAfter: [saved.id],
  })

  // Select the new arrow
  selectedNoteIds.clear()
  selectedArrowIds.clear()
  selectedArrowIds.add(saved.id)

  return saved
}

export async function updateArrow(arrow: Arrow) {
  const storage = getStorage()
  arrow.updatedAt = Date.now()
  arrows.set(arrow.id, arrow)
  await storage.saveArrow(arrow)
}

export async function deleteArrow(arrowId: string) {
  const storage = getStorage()
  const arrow = arrows.get(arrowId)
  if (!arrow) return

  const arrowSelBefore = Array.from(selectedArrowIds)

  arrows.delete(arrowId)
  selectedArrowIds.delete(arrowId)
  await storage.deleteArrow(arrowId)

  history.pushAction({
    description: 'Delete arrow',
    pageId: currentPage.value?.id ?? '',
    notesBefore: {},
    notesAfter: {},
    arrowsBefore: { [arrowId]: deepClone(arrow) },
    arrowsAfter: { [arrowId]: null },
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: selectionArray(),
    selectionAfter: selectionArray(),
    arrowSelectionBefore: arrowSelBefore,
    arrowSelectionAfter: [],
  })
}

export async function deleteSelectedArrows() {
  const storage = getStorage()
  const ids = Array.from(selectedArrowIds)
  if (ids.length === 0) return

  const arrowsBefore: Record<string, Arrow | null> = {}
  const arrowsAfterMap: Record<string, Arrow | null> = {}
  const arrowSelBefore = [...ids]

  for (const id of ids) {
    const arrow = arrows.get(id)
    if (arrow) {
      arrowsBefore[id] = deepClone(arrow)
      arrowsAfterMap[id] = null
      arrows.delete(id)
      await storage.deleteArrow(id)
    }
  }
  selectedArrowIds.clear()

  history.pushAction({
    description: 'Delete arrows',
    pageId: currentPage.value?.id ?? '',
    notesBefore: {},
    notesAfter: {},
    arrowsBefore,
    arrowsAfter: arrowsAfterMap,
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: selectionArray(),
    selectionAfter: selectionArray(),
    arrowSelectionBefore: arrowSelBefore,
    arrowSelectionAfter: [],
  })
}
