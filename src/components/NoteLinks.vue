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
  flex-wrap: wrap;
  gap: 3px;
}

.note-link-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.65em;
  cursor: pointer;
  user-select: none;
  background: color-mix(in srgb, var(--chip-color) 30%, transparent);
  border: 1px solid color-mix(in srgb, var(--chip-color) 45%, transparent);
  color: var(--text-secondary);
  transition: background 0.15s;
  max-width: 120px;
}

.note-link-chip:hover {
  background: color-mix(in srgb, var(--chip-color) 45%, transparent);
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
