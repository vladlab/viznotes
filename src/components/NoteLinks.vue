<template>
  <div v-if="linkedNotes.length > 0" class="note-links-section" :class="`links-${viewMode}`">

    <!-- TAG mode: horizontal pill row -->
    <div v-if="viewMode === 'tag'" class="note-links-tags">
      <span
        v-for="ln in linkedNotes"
        :key="ln.linkId"
        class="link-tag"
        :style="{ '--chip-color': ln.chipColor }"
        :title="ln.title"
        @click.stop="selectLinked(ln.noteId)"
      >
        {{ ln.title }}
        <button
          class="link-tag-remove"
          @click.stop="removeLink(ln.linkId)"
          title="Remove link"
        >&times;</button>
      </span>
    </div>

    <!-- BRIEF mode: vertical chevron chips (original) -->
    <div v-else-if="viewMode === 'brief'" class="note-links-list">
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

    <!-- FULL mode: render linked notes as full NoteComponents -->
    <div v-else class="note-links-full">
      <template v-for="ln in linkedNotes" :key="ln.linkId">
        <div v-if="ancestorIds.has(ln.noteId)" class="linked-note-cycle">
          ↻ {{ ln.title }} (circular)
        </div>
        <div v-else-if="getLinkedNote(ln.noteId)" class="linked-note-wrapper">
          <NoteComponent
            :note="getLinkedNote(ln.noteId)!"
            :spatial="false"
            :linkedView="true"
            :depth="depth + 1"
          />
          <button
            class="linked-note-remove"
            @click.stop="removeLink(ln.linkId)"
            title="Remove link"
          >&times;</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, inject } from 'vue'
import type { Note } from '../types/note'
import { NODE_TYPES, getNoteColor } from '../types/note'
import { appStore } from '../stores/app'
import { history } from '../stores/history'
import { getNoteTitleText } from '../utils/platform'
import NoteComponent from './NoteComponent.vue'

const props = withDefaults(defineProps<{
  note: Note
  depth?: number
}>(), {
  depth: 0,
})

const MAX_FULL_DEPTH = 3

// Recursion guard — injected from NoteComponent
const ancestorIds = inject<Set<string>>('linkAncestorIds', new Set())

const viewMode = computed(() => {
  if (props.depth >= MAX_FULL_DEPTH && props.note.linkViewMode === 'full') return 'brief'
  return props.note.linkViewMode || 'brief'
})

const dragIdx = ref<number | null>(null)
const dropIdx = ref<number | null>(null)

const linkedNotes = computed(() => {
  const noteLinks = appStore.getLinksForNote(props.note.id)
  const order = props.note.linkOrder || []

  const linkMap = new Map(noteLinks.map(l => [l.id, l]))
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
      chipColor: color,
      chipStyle: { '--chip-color': color },
    }
  })
})

function getLinkedNote(noteId: string): Note | undefined {
  return appStore.notes.get(noteId)
}

function selectLinked(noteId: string) {
  if (appStore.notes.has(noteId)) {
    appStore.selectNote(noteId, false)
    appStore.focusNoteId.value = noteId
  }
}

function removeLink(linkId: string) {
  appStore.deleteLink(linkId)
}

// ── Drag-to-reorder (brief mode) ──

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
  const target = (e.currentTarget as HTMLElement)
  const rect = target.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  dropIdx.value = e.clientY < midY ? idx : idx + 1
}

function onDragLeave(_idx: number) {}

function onDrop(idx: number) {
  if (dragIdx.value === null || dropIdx.value === null) return
  const fromIdx = dragIdx.value
  let toIdx = dropIdx.value

  dragIdx.value = null
  dropIdx.value = null

  if (fromIdx === toIdx || fromIdx + 1 === toIdx) return

  const ids = linkedNotes.value.map(ln => ln.linkId)
  const [moved] = ids.splice(fromIdx, 1)
  if (toIdx > fromIdx) toIdx--
  ids.splice(toIdx, 0, moved)

  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.linkOrder = ids
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Reorder links')
}
</script>

<style>
.note-links-section {
  border-top: 1px solid var(--divider);
  flex-shrink: 0;
}

/* ── Tag mode ── */

.note-links-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 4px 6px;
}

.link-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.75em;
  background: color-mix(in srgb, var(--chip-color) 20%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.link-tag:hover {
  background: color-mix(in srgb, var(--chip-color) 35%, transparent);
}

.link-tag-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.1em;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transition: opacity 0.1s;
}

.link-tag:hover .link-tag-remove {
  opacity: 0.6;
}

.link-tag-remove:hover {
  opacity: 1 !important;
  color: var(--danger-text);
}

/* ── Brief mode (original chevron chips) ── */

.note-links-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
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

.link-drop-indicator.top { top: -2px; }
.link-drop-indicator.bottom { bottom: -2px; }

/* ── Full mode ── */

.note-links-full {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}

.linked-note-wrapper {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
}

.linked-note-wrapper > .note-outer {
  border-left: 3px solid var(--accent);
}

.linked-note-remove {
  position: absolute;
  top: 2px;
  right: 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.1em;
  line-height: 1;
  cursor: pointer;
  padding: 1px 3px;
  opacity: 0;
  transition: opacity 0.1s;
  z-index: 2;
}

.linked-note-wrapper:hover .linked-note-remove {
  opacity: 0.6;
}

.linked-note-remove:hover {
  opacity: 1 !important;
  color: var(--danger-text);
}

.linked-note-cycle {
  font-size: 0.78em;
  color: var(--text-faint);
  padding: 4px 8px;
  font-style: italic;
}
</style>
