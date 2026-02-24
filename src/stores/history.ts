import { ref, computed, toRaw } from 'vue'
import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(toRaw(obj)))
}

// ── Types ──

interface NoteSnapshot { [noteId: string]: Note | null }
interface ArrowSnapshot { [arrowId: string]: Arrow | null }

interface UndoAction {
  description: string
  notesBefore: NoteSnapshot
  notesAfter: NoteSnapshot
  arrowsBefore: ArrowSnapshot
  arrowsAfter: ArrowSnapshot
  rootIdsBefore: string[] | null
  rootIdsAfter: string[] | null
  selectionBefore: string[]
  selectionAfter: string[]
  arrowSelectionBefore: string[]
  arrowSelectionAfter: string[]
}

type UndoActionInput = Omit<UndoAction, 'arrowsBefore' | 'arrowsAfter' | 'arrowSelectionBefore' | 'arrowSelectionAfter'> & {
  arrowsBefore?: ArrowSnapshot
  arrowsAfter?: ArrowSnapshot
  arrowSelectionBefore?: string[]
  arrowSelectionAfter?: string[]
}

// ── Stack ──

const MAX_HISTORY = 100

const undoStack = ref<UndoAction[]>([])
const redoStack = ref<UndoAction[]>([])

const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

// Applied by the store
let applySnapshot: (action: UndoAction, direction: 'undo' | 'redo') => Promise<void>

function setApplySnapshot(fn: typeof applySnapshot) {
  applySnapshot = fn
}

function pushAction(input: UndoActionInput) {
  const action: UndoAction = {
    ...input,
    arrowsBefore: input.arrowsBefore ?? {},
    arrowsAfter: input.arrowsAfter ?? {},
    arrowSelectionBefore: input.arrowSelectionBefore ?? [],
    arrowSelectionAfter: input.arrowSelectionAfter ?? [],
  }
  undoStack.value.push(action)
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
}

async function undo() {
  const action = undoStack.value.pop()
  if (!action) return
  await applySnapshot(action, 'undo')
  redoStack.value.push(action)
}

async function redo() {
  const action = redoStack.value.pop()
  if (!action) return
  await applySnapshot(action, 'redo')
  undoStack.value.push(action)
}

function clear() {
  undoStack.value = []
  redoStack.value = []
}

// ── Helpers ──

function snapshotNote(notes: Map<string, Note>, id: string): Note | null {
  const note = notes.get(id)
  return note ? deepClone(note) : null
}

function snapshotNotes(notes: Map<string, Note>, ids: string[]): NoteSnapshot {
  const snapshot: NoteSnapshot = {}
  for (const id of ids) snapshot[id] = snapshotNote(notes, id)
  return snapshot
}

function snapshotArrow(arrows: Map<string, Arrow>, id: string): Arrow | null {
  const arrow = arrows.get(id)
  return arrow ? deepClone(arrow) : null
}

function snapshotArrows(arrows: Map<string, Arrow>, ids: string[]): ArrowSnapshot {
  const snapshot: ArrowSnapshot = {}
  for (const id of ids) snapshot[id] = snapshotArrow(arrows, id)
  return snapshot
}

function collectDescendantIds(notes: Map<string, Note>, rootId: string): string[] {
  const result: string[] = [rootId]
  const note = notes.get(rootId)
  if (note?.container.enabled) {
    for (const childId of note.container.childIds) {
      result.push(...collectDescendantIds(notes, childId))
    }
  }
  return result
}

export type { UndoAction }

export const history = {
  undoStack,
  redoStack,
  canUndo,
  canRedo,
  pushAction,
  undo,
  redo,
  clear,
  snapshotNote,
  snapshotNotes,
  snapshotArrow,
  snapshotArrows,
  collectDescendantIds,
  setApplySnapshot,
}
