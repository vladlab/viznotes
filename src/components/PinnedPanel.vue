<template>
  <div v-if="pinnedNotes.length > 0" class="pinned-panel">
    <div
      v-for="(note, idx) in pinnedNotes"
      :key="note.id"
      class="pinned-column"
      :style="{ width: `${columnWidths[idx] ?? 320}px` }"
    >
      <!-- Column header -->
      <div class="pinned-header">
        <span class="pinned-title">{{ getNoteTitle(note) }}</span>
        <button class="pinned-close" @click="unpinNote(note.id)" title="Unpin">&times;</button>
      </div>

      <!-- Scrollable content -->
      <div class="pinned-content" @dblclick="startEditing(note.id)">
        <!-- Head -->
        <div class="pinned-section-label">Head</div>
        <NoteTextSection :note="note" sectionName="head" />

        <!-- AutoBody / Data -->
        <template v-if="hasAutoBody(note)">
          <div class="pinned-section-label">Data</div>
          <NoteTextSection :note="note" sectionName="autoBody" />
        </template>

        <!-- Body -->
        <template v-if="note.body.enabled">
          <div class="pinned-section-label">Body</div>
          <NoteTextSection :note="note" sectionName="body" />
        </template>

        <!-- Container children (read-only summary) -->
        <template v-if="note.container.enabled && note.container.childIds.length > 0">
          <div class="pinned-section-label">Container ({{ note.container.childIds.length }})</div>
          <div class="pinned-children">
            <div
              v-for="childId in note.container.childIds"
              :key="childId"
              class="pinned-child-chip"
              @click="focusNote(childId)"
            >
              {{ getChildTitle(childId) }}
            </div>
          </div>
        </template>

        <!-- Links -->
        <template v-if="noteLinks(note.id).length > 0">
          <div class="pinned-section-label">Links ({{ noteLinks(note.id).length }})</div>
          <NoteLinks :note="note" />
        </template>
      </div>

      <!-- Resize handle -->
      <div
        class="pinned-resize-handle"
        @pointerdown.stop="startResize(idx, $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { Note } from '../types/note'
import { appStore } from '../stores/app'
import { pinnedNoteIds, unpinNote } from '../stores/pinned'
import { noteHasAutoBody } from '../utils/autoSections'
import NoteTextSection from './NoteTextSection.vue'
import NoteLinks from './NoteLinks.vue'

const columnWidths = reactive<Record<number, number>>({})

const pinnedNotes = computed(() => {
  return pinnedNoteIds
    .map(id => appStore.notes.get(id))
    .filter((n): n is Note => n !== undefined)
})

function getNoteTitle(note: Note): string {
  const content = note.head?.content?.content
  if (!content) return 'Untitled'
  for (const node of content) {
    if (node.content) {
      const text = node.content.map((c: any) => c.text || '').join('')
      if (text) return text
    }
  }
  return 'Untitled'
}

function getChildTitle(childId: string): string {
  const note = appStore.notes.get(childId)
  if (!note) return 'Deleted'
  return getNoteTitle(note)
}

function hasAutoBody(note: Note): boolean {
  return noteHasAutoBody(note)
}

function noteLinks(noteId: string) {
  return appStore.getLinksForNote(noteId)
}

function focusNote(noteId: string) {
  if (appStore.notes.has(noteId)) {
    appStore.selectNote(noteId, false)
    appStore.focusNoteId.value = noteId
  }
}

function startEditing(noteId: string) {
  appStore.setEditingNote(noteId)
}

// ── Column resize ──

function startResize(idx: number, e: PointerEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = columnWidths[idx] ?? 320

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX
    columnWidths[idx] = Math.max(200, Math.min(600, startWidth + dx))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
</script>

<style>
.pinned-panel {
  display: flex;
  flex-shrink: 0;
  height: 100%;
  border-right: 1px solid var(--border-main);
  background: var(--bg-surface);
  overflow: hidden;
}

.pinned-column {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 200px;
  max-width: 600px;
  position: relative;
  border-right: 1px solid var(--border-subtle);
}

.pinned-column:last-child {
  border-right: none;
}

.pinned-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  min-height: 32px;
}

.pinned-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85em;
  font-weight: 600;
  color: var(--text-secondary);
}

.pinned-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.2em;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.pinned-close:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.pinned-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.pinned-section-label {
  font-size: 0.7em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-faint);
  padding: 6px 10px 2px;
}

.pinned-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 8px;
}

.pinned-child-chip {
  font-size: 0.82em;
  padding: 3px 8px;
  border-radius: 3px;
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pinned-child-chip:hover {
  background: var(--accent-bg);
  color: var(--accent-text);
}

.pinned-resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.pinned-resize-handle:hover,
.pinned-resize-handle:active {
  background: var(--accent);
  opacity: 0.3;
}

/* Pinned note sections don't need the border-top that NoteTextSection normally gets */
.pinned-content .note-text-section {
  border-top: none;
}

/* Pinned note links section */
.pinned-content .note-links-section {
  border-top: none;
}
</style>
