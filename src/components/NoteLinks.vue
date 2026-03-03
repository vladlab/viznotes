<template>
  <div v-if="linkedNotes.length > 0" class="note-links-section">
    <div class="note-links-list">
      <div
        v-for="ln in linkedNotes"
        :key="ln.linkId"
        class="note-link-chip"
        :style="ln.chipStyle"
        @click.stop="selectLinked(ln.noteId)"
        @dblclick.stop="selectLinked(ln.noteId)"
        :title="ln.title"
      >
        <svg class="link-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span class="link-chip-title">{{ ln.title }}</span>
        <button
          class="link-chip-remove"
          @click.stop="removeLink(ln.linkId)"
          title="Remove link"
        >×</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Note } from '../types/note'
import { appStore } from '../stores/app'
import { getNoteColor } from '../types/note'

const props = defineProps<{
  note: Note
}>()

function getPlainText(content: any): string {
  if (!content?.content) return 'Untitled'
  const texts: string[] = []
  for (const node of content.content) {
    if (node.content) {
      for (const child of node.content) {
        if (child.text) texts.push(child.text)
      }
    }
  }
  return texts.join(' ').trim() || 'Untitled'
}

const linkedNotes = computed(() => {
  const noteLinks = appStore.getLinksForNote(props.note.id)
  return noteLinks.map(link => {
    const otherId = appStore.linkedNoteId(link, props.note.id)
    const otherNote = appStore.notes.get(otherId)
    const title = otherNote ? getPlainText(otherNote.head.content) : 'Deleted'
    const color = otherNote ? getNoteColor(otherNote.color.value) : '#888'
    return {
      linkId: link.id,
      noteId: otherId,
      title,
      chipStyle: {
        '--chip-color': color,
      },
    }
  })
})

function selectLinked(noteId: string) {
  if (appStore.notes.has(noteId)) {
    appStore.selectNote(noteId, false)
    appStore.focusNoteId.value = noteId
  }
}

function removeLink(linkId: string) {
  appStore.deleteLink(linkId)
}
</script>

<style>
.note-links-section {
  border-top: 1px solid var(--divider);
  padding: 4px 6px;
  flex-shrink: 0;
}

.note-links-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.note-link-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.85em;
  cursor: pointer;
  user-select: none;
  background: color-mix(in srgb, var(--chip-color) 15%, transparent);
  border: none;
  border-left: 4px solid var(--chip-color);
  color: var(--text-secondary);
  transition: background 0.15s;
}

.note-link-chip:hover {
  background: color-mix(in srgb, var(--chip-color) 28%, transparent);
}

.link-chip-icon {
  flex-shrink: 0;
  opacity: 0.7;
  color: var(--chip-color);
}

.link-chip-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-chip-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.2em;
  line-height: 1;
  cursor: pointer;
  padding: 0 1px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.note-link-chip:hover .link-chip-remove {
  opacity: 0.7;
}

.link-chip-remove:hover {
  opacity: 1 !important;
  color: var(--danger-text);
}
</style>
