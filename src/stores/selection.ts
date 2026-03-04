/**
 * Selection and editing state management.
 * Imports only from state.ts and history.ts — no circular dependencies.
 */

import { toRaw } from 'vue'
import type { Note } from '../types/note'
import { history } from './history'
import {
  notes,
  currentPage,
  selectedNoteIds,
  selectedArrowIds,
  editingNoteId,
  editStartSnapshot,
  setEditStartSnapshot,
  deepClone,
  bringToTop,
} from './state'

// ── Selection ──

export function selectNote(noteId: string, additive = false) {
  if (!additive) {
    selectedNoteIds.clear()
    selectedArrowIds.clear()
  }
  selectedNoteIds.add(noteId)
  const note = notes.get(noteId)
  if (note) bringToTop(note)
}

export function toggleNoteSelection(noteId: string) {
  if (selectedNoteIds.has(noteId)) {
    selectedNoteIds.delete(noteId)
  } else {
    selectedNoteIds.add(noteId)
    const note = notes.get(noteId)
    if (note) bringToTop(note)
  }
}

export function selectArrow(arrowId: string, additive = false) {
  if (!additive) {
    selectedNoteIds.clear()
    selectedArrowIds.clear()
  }
  selectedArrowIds.add(arrowId)
}

export function clearSelection() {
  selectedNoteIds.clear()
  selectedArrowIds.clear()
}

export function isSelected(noteId: string): boolean {
  return selectedNoteIds.has(noteId)
}

// ── Editing ──

export function setEditingNote(noteId: string) {
  if (editingNoteId.value && editingNoteId.value !== noteId) {
    finalizeEdit()
  }

  setEditStartSnapshot(history.snapshotNote(notes, noteId))
  editingNoteId.value = noteId

  if (!selectedNoteIds.has(noteId)) {
    selectedNoteIds.clear()
    selectedNoteIds.add(noteId)
  }
}

export function clearEditing() {
  if (editingNoteId.value) {
    finalizeEdit()
  }
  editingNoteId.value = null
}

/** Compare edit start snapshot to current state; push undo action if changed */
function finalizeEdit() {
  if (!editStartSnapshot || !editingNoteId.value) {
    setEditStartSnapshot(null)
    return
  }

  const noteId = editingNoteId.value
  const currentNote = notes.get(noteId)
  if (!currentNote) {
    setEditStartSnapshot(null)
    return
  }

  const beforeJson = JSON.stringify(toRaw(editStartSnapshot))
  const afterJson = JSON.stringify(toRaw(currentNote))

  if (beforeJson !== afterJson) {
    history.pushAction({
      description: 'Edit note',
      pageId: currentNote.pageId,
      notesBefore: { [noteId]: history.diffNote(currentNote as Note, editStartSnapshot as Note) },
      notesAfter: { [noteId]: history.diffNote(editStartSnapshot as Note, currentNote as Note) },
      rootIdsBefore: null,
      rootIdsAfter: null,
      selectionBefore: [noteId],
      selectionAfter: [noteId],
    })
  }

  setEditStartSnapshot(null)
}
