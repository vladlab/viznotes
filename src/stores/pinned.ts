/**
 * Pinned notes — ephemeral (not persisted), clears on page switch.
 * Each pinned note renders as a full-height column in the PinnedPanel.
 */

import { reactive, watch } from 'vue'
import { appStore } from './app'

export const pinnedNoteIds = reactive<string[]>([])

export function pinNote(noteId: string) {
  if (!pinnedNoteIds.includes(noteId)) {
    pinnedNoteIds.push(noteId)
  }
}

export function unpinNote(noteId: string) {
  const idx = pinnedNoteIds.indexOf(noteId)
  if (idx >= 0) pinnedNoteIds.splice(idx, 1)
}

export function isNotePinned(noteId: string): boolean {
  return pinnedNoteIds.includes(noteId)
}

export function clearPins() {
  pinnedNoteIds.splice(0)
}

// Clear pins when page changes
watch(() => appStore.currentPageId.value, () => {
  clearPins()
})
