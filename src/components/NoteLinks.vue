<template>
  <div v-if="linkedNotes.length > 0" class="note-links-section">
    <div class="note-links-list">
      <div
        v-for="(ln, idx) in linkedNotes"
        :key="ln.linkId"
        class="note-link-chip"
        :class="{ 'drag-source': dragIdx === idx }"
        :style="ln.chipStyle"
        :title="ln.title"
        draggable="true"
        @dragstart="onDragStart(idx, $event)"
        @dragend="onDragEnd"
        @dragover.prevent="onDragOver(idx, $event)"
        @dragleave="onDragLeave(idx)"
        @drop.prevent="onDrop(idx)"
      >
        <div
          v-if="dropIdx === idx"
          class="link-drop-indicator top"
        />
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
        <div
          v-if="dropIdx === linkedNotes.length && idx === linkedNotes.length - 1"
          class="link-drop-indicator bottom"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Note } from '../types/note'
import { NODE_TYPES, getNoteColor } from '../types/note'
import { appStore } from '../stores/app'
import { history } from '../stores/history'
import { getNoteTitleText } from '../utils/platform'

const props = defineProps<{
  note: Note
}>()

const dragIdx = ref<number | null>(null)
const dropIdx = ref<number | null>(null)

const linkedNotes = computed(() => {
  const noteLinks = appStore.getLinksForNote(props.note.id)
  const order = props.note.linkOrder || []

  // Build lookup: linkId → Link
  const linkMap = new Map(noteLinks.map(l => [l.id, l]))

  // Ordered links: linkOrder first, then any remaining by creation time
  const ordered: typeof noteLinks = []
  const seen = new Set<string>()
  for (const id of order) {
    const link = linkMap.get(id)
    if (link) { ordered.push(link); seen.add(id) }
  }
  for (const link of noteLinks) {
    if (!seen.has(link.id)) ordered.push(link)
  }

  return ordered.map(link => {
    const otherId = appStore.linkedNoteId(link, props.note.id)
    const otherNote = appStore.notes.get(otherId)
    const title = otherNote ? getNoteTitleText(otherNote.head.content) : 'Deleted'
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

// ── Drag-to-reorder ──

function onDragStart(idx: number, e: DragEvent) {
  dragIdx.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', '')
  }
}

function onDragEnd() {
  dragIdx.value = null
  dropIdx.value = null
}

function onDragOver(idx: number, e: DragEvent) {
  if (dragIdx.value === null) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

  // Determine if cursor is in top or bottom half of the chip
  const target = (e.currentTarget as HTMLElement)
  const rect = target.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  const insertIdx = e.clientY < midY ? idx : idx + 1
  dropIdx.value = insertIdx
}

function onDragLeave(_idx: number) {
  // Only clear if leaving the list entirely (dragover on next chip will re-set)
}

function onDrop(idx: number) {
  if (dragIdx.value === null || dropIdx.value === null) return
  const fromIdx = dragIdx.value
  let toIdx = dropIdx.value

  dragIdx.value = null
  dropIdx.value = null

  if (fromIdx === toIdx || fromIdx + 1 === toIdx) return

  // Build new order from current linkedNotes
  const ids = linkedNotes.value.map(ln => ln.linkId)
  const [moved] = ids.splice(fromIdx, 1)
  // Adjust target index after removal
  if (toIdx > fromIdx) toIdx--
  ids.splice(toIdx, 0, moved)

  // Persist with undo
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.linkOrder = ids
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Reorder links')
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
  overflow: visible;
  min-height: 28px;
  cursor: grab;
}

.note-link-chip.drag-source {
  opacity: 0.3;
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

.link-drop-indicator {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent);
  border-radius: 2px;
  pointer-events: none;
  z-index: 1;
}

.link-drop-indicator.top {
  top: -2px;
}

.link-drop-indicator.bottom {
  bottom: -2px;
}
</style>
