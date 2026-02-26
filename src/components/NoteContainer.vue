<template>
  <div
    v-if="note.container.enabled"
    class="note-container-section"
    :class="{
      horizontal: note.container.horizontal,
      vertical: !note.container.horizontal,
    }"
    @dblclick.stop="onDoubleClick"
  >
    <div
      class="note-container-list"
      :class="{ horizontal: note.container.horizontal }"
    >
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
  // Prevent propagation so it doesn't trigger parent note's dblclick
  e.stopPropagation()

  const target = e.target as HTMLElement
  // Only create note if clicking on empty container area
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

.note-container-list.horizontal {
  flex-direction: row;
}

.container-empty {
  padding: 12px;
  text-align: center;
  color: var(--text-faint);
  font-size: 0.75em;
  user-select: none;
}
</style>
