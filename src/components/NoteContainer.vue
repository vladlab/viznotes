<template>
  <div
    v-if="note.container.enabled"
    class="note-container-section"
    :class="{ 'columns-layout': isColumns }"
    @dblclick.stop="onDoubleClick"
  >
    <div class="note-container-list" :class="{ 'columns-row': isColumns }">
      <template v-for="(childNote, idx) in childNotes" :key="childNote.id">
        <div
          v-if="!isColumns && showInsertAt === idx"
          class="container-drop-indicator"
        />
        <div
          v-if="isColumns && showInsertAt === idx"
          class="container-column-drop-indicator"
        />
        <NoteComponent
          :note="childNote"
          :parentNoteId="note.id"
          :depth="depth + 1"
          :spatial="false"
        />
      </template>
      <div
        v-if="!isColumns && showInsertAt === childNotes.length"
        class="container-drop-indicator"
      />
      <div
        v-if="isColumns && showInsertAt === childNotes.length"
        class="container-column-drop-indicator"
      />
    </div>

    <div
      v-if="childNotes.length === 0"
      class="container-empty"
    >
      Double-click to add a {{ isColumns ? 'column' : 'note' }}
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

const isColumns = computed(() => (props.note.container.layout || 'list') === 'columns')

const childNotes = computed(() => {
  return props.note.container.childIds
    .map(id => appStore.notes.get(id))
    .filter((n): n is Note => n !== undefined)
})

const showInsertAt = computed(() => {
  if (appStore.dropInsertParentId.value !== props.note.id) return -1
  return appStore.dropInsertIndex.value
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

  // For columns layout, new children default to being containers themselves
  if (isColumns.value) {
    appStore.createNote({ x: 0, y: 0 }, props.note.id, {
      startEditing: true,
      enableBody: false,
    }).then(note => {
      note.container.enabled = true
      note.container.layout = 'list'
      appStore.updateNote(note)
    })
  } else {
    appStore.createNote({ x: 0, y: 0 }, props.note.id)
  }
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

/* Columns layout */
.note-container-section.columns-layout {
  overflow-x: auto;
  overflow-y: hidden;
}

.note-container-list.columns-row {
  flex-direction: row;
  align-items: stretch;
  gap: 3px;
  min-height: 120px;
  padding: 4px;
}

.columns-row > .note-outer {
  flex: 1 1 0;
  min-width: 140px;
}

.container-empty {
  padding: 12px;
  text-align: center;
  color: var(--text-faint);
  font-size: 0.75em;
  user-select: none;
}

.container-drop-indicator {
  height: 3px;
  background: var(--accent);
  border-radius: 2px;
  margin: -1px 4px;
  opacity: 0.8;
  pointer-events: none;
}

.container-column-drop-indicator {
  width: 3px;
  min-height: 40px;
  background: var(--accent);
  border-radius: 2px;
  margin: 4px -1px;
  opacity: 0.8;
  pointer-events: none;
  flex-shrink: 0;
}
</style>
