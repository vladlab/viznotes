<template>
  <div
    v-if="note.container.enabled"
    class="note-container-section"
    @dblclick.stop="onDoubleClick"
  >
    <div class="note-container-list">
      <NoteComponent
        v-for="childNote in childNotes"
        :key="childNote.id"
        :note="childNote"
        :parentNoteId="note.id"
        :depth="depth + 1"
        :spatial="false"
      />
    </div>

    <div
      v-if="childNotes.length === 0"
      class="container-empty"
    >
      Double-click to add a note
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Note } from '../types/note'
import { appStore } from '../stores/app'
import NoteComponent from './NoteComponent.vue'

const props = defineProps<{
  note: Note
  depth: number
}>()

const childNotes = computed(() => {
  return props.note.container.childIds
    .map(id => appStore.notes.get(id))
    .filter((n): n is Note => n !== undefined)
})

function onDoubleClick(e: MouseEvent) {
  e.stopPropagation()

  const target = e.target as HTMLElement
  if (
    target.closest('.note-outer') &&
    !target.classList.contains('note-container-list') &&
    !target.classList.contains('note-container-section') &&
    !target.classList.contains('container-empty')
  ) {
    return
  }

  appStore.createNote({ x: 0, y: 0 }, props.note.id)
}
</script>

<style>
.note-container-section {
  border-top: 1px solid var(--divider);
  min-height: 40px;
  flex: 1;
  overflow: auto;
}

.note-container-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}

.container-empty {
  padding: 12px;
  text-align: center;
  color: var(--text-faint);
  font-size: 0.75em;
  user-select: none;
}
</style>
