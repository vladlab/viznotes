import { ref, computed, toRaw } from 'vue'
import type { Note } from '../types/note'
import type { Arrow } from '../types/arrow'
import type { Link } from '../types/link'

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(toRaw(obj)))
}

// ── Types ──

/** Note snapshots can be full Notes (create/delete) or property-level diffs (mutations) */
interface NoteSnapshot { [noteId: string]: Partial<Note> | null }
interface ArrowSnapshot { [arrowId: string]: Arrow | null }
interface LinkSnapshot { [linkId: string]: Link | null }

interface UndoAction {
  description: string
  pageId: string  // which page this action belongs to
  notesBefore: NoteSnapshot
  notesAfter: NoteSnapshot
  arrowsBefore: ArrowSnapshot
  arrowsAfter: ArrowSnapshot
  linksBefore: LinkSnapshot
  linksAfter: LinkSnapshot
  rootIdsBefore: string[] | null
  rootIdsAfter: string[] | null
  selectionBefore: string[]
  selectionAfter: string[]
  arrowSelectionBefore: string[]
  arrowSelectionAfter: string[]
}

type UndoActionInput = Omit<UndoAction, 'arrowsBefore' | 'arrowsAfter' | 'arrowSelectionBefore' | 'arrowSelectionAfter' | 'linksBefore' | 'linksAfter'> & {
  arrowsBefore?: ArrowSnapshot
  arrowsAfter?: ArrowSnapshot
  arrowSelectionBefore?: string[]
  arrowSelectionAfter?: string[]
  linksBefore?: LinkSnapshot
  linksAfter?: LinkSnapshot
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
    linksBefore: input.linksBefore ?? {},
    linksAfter: input.linksAfter ?? {},
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

/** Remove all undo/redo actions for a specific page (called when page is unloaded) */
function purgePageActions(pageId: string) {
  undoStack.value = undoStack.value.filter(a => a.pageId !== pageId)
  redoStack.value = redoStack.value.filter(a => a.pageId !== pageId)
}

// ── Snapshot helpers ──

function snapshotNote(notes: Map<string, Note>, id: string): Note | null {
  const note = notes.get(id)
  return note ? deepClone(note) : null
}

function snapshotNotes(notes: Map<string, Note>, ids: string[]): Record<string, Note | null> {
  const snapshot: Record<string, Note | null> = {}
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

function collectDescendantIds(notes: Map<string, Note>, rootId: string, visited = new Set<string>()): string[] {
  if (visited.has(rootId)) return []
  visited.add(rootId)
  const result: string[] = [rootId]
  const note = notes.get(rootId)
  if (note?.container.enabled) {
    for (const childId of note.container.childIds) {
      result.push(...collectDescendantIds(notes, childId, visited))
    }
  }
  return result
}

// ── Diff system ──

function diffNote(from: Note, to: Note): Partial<Note> {
  const diff: any = {}
  for (const key of Object.keys(to)) {
    if (key === 'id' || key === 'pageId' || key === 'createdAt' || key === 'updatedAt') continue
    const fromStr = JSON.stringify((from as any)[key])
    const toStr = JSON.stringify((to as any)[key])
    if (fromStr !== toStr) {
      diff[key] = JSON.parse(toStr)
    }
  }
  return diff
}

function optimizeSnapshots(
  beforeSnaps: Record<string, Note | null>,
  afterSnaps: Record<string, Note | null>,
): { notesBefore: NoteSnapshot; notesAfter: NoteSnapshot } {
  const notesBefore: NoteSnapshot = {}
  const notesAfter: NoteSnapshot = {}

  const allIds = new Set([...Object.keys(beforeSnaps), ...Object.keys(afterSnaps)])
  for (const id of allIds) {
    const b = beforeSnaps[id] ?? null
    const a = afterSnaps[id] ?? null

    if (b !== null && a !== null) {
      notesBefore[id] = diffNote(a, b)
      notesAfter[id] = diffNote(b, a)
    } else {
      notesBefore[id] = b
      notesAfter[id] = a
    }
  }

  return { notesBefore, notesAfter }
}

function isFullNote(snapshot: Partial<Note>): snapshot is Note {
  return 'id' in snapshot && 'pageId' in snapshot && 'head' in snapshot && 'body' in snapshot
}

export type { UndoAction, UndoActionInput }

export const history = {
  undoStack,
  redoStack,
  canUndo,
  canRedo,
  pushAction,
  undo,
  redo,
  clear,
  purgePageActions,
  snapshotNote,
  snapshotNotes,
  snapshotArrow,
  snapshotArrows,
  collectDescendantIds,
  setApplySnapshot,
  diffNote,
  optimizeSnapshots,
  isFullNote,
}
