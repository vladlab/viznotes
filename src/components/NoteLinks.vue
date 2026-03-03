<template>
  <div v-if="linkedNotes.length > 0" class="note-links-section">
    <div class="note-links-list">
      <div
        v-for="ln in linkedNotes"
        :key="ln.linkId"
        class="note-link-chip"
        :style="ln.chipStyle"
        :title="ln.title"
      >
        <div
          class="link-chip-chevron"
          @click.stop="selectLinked(ln.noteId)"
          @dblclick.stop
          :title="`Go to ${ln.title}`"
        >
          <span v-if="ln.typeLabel" class="link-chip-type">{{ ln.typeLabel }}</span>
        </div>
        <span class="link-chip-title">{{ ln.title }}</span>
        <button
          class="link-chip-remove"
          @click.stop="removeLink(ln.linkId)"
          title="Remove link"
        >&times;</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Note } from '../types/note'
import { NODE_TYPES, getNoteColor } from '../types/note'
import { appStore } from '../stores/app'

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
    const nodeType = otherNote?.nodeType || 'default'
    const typeLabel = NODE_TYPES[nodeType]?.label || ''
    return {
      linkId: link.id,
      noteId: otherId,
      title,
      typeLabel,
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
  align-items: stretch;
  gap: 6px;
  padding: 0 8px 0 0;
  border-radius: 4px;
  font-size: 0.85em;
  user-select: none;
  background: color-mix(in srgb, var(--chip-color) 15%, transparent);
  border: none;
  color: var(--text-secondary);
  transition: background 0.15s;
  position: relative;
  overflow: hidden;
  min-height: 28px;
}

.note-link-chip:hover {
  background: color-mix(in srgb, var(--chip-color) 28%, transparent);
}

.link-chip-chevron {
  flex-shrink: 0;
  width: 60px;
  background: var(--chip-color);
  clip-path: polygon(0 0, 70% 0, 100% 50%, 70% 100%, 0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding-right: 10px;
  cursor: pointer;
}

.link-chip-chevron:hover {
  filter: brightness(1.2);
}

.link-chip-type {
  font-size: 0.5em;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.link-chip-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
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
  margin-left: auto;
  display: flex;
  align-items: center;
}

.note-link-chip:hover .link-chip-remove {
  opacity: 0.7;
}

.link-chip-remove:hover {
  opacity: 1 !important;
  color: var(--danger-text);
}
</style>
