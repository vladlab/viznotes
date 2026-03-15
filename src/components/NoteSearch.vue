<template>
  <div class="note-search-section">
    <!-- Search input -->
    <div class="search-input-row">
      <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref="searchInput"
        class="search-field"
        type="text"
        v-model="query"
        placeholder="Search this page…"
        spellcheck="false"
        @keydown.enter.prevent="doSearch"
      />
      <span v-if="resultIds.length > 0" class="search-count">{{ resultIds.length }}</span>
    </div>

    <!-- Results -->
    <template v-if="resultIds.length > 0">
      <!-- Tag mode -->
      <div v-if="viewMode === 'tag'" class="note-links-tags search-results-tags">
        <span
          v-for="id in resultIds"
          :key="id"
          class="link-tag"
          :style="{ '--chip-color': getNoteColor(id) }"
          :title="getNoteTitle(id)"
          @click.stop="navigateTo(id)"
        >
          {{ getNoteTitle(id) }}
        </span>
      </div>

      <!-- Brief mode -->
      <div v-else-if="viewMode === 'brief'" class="note-links-list search-results-brief">
        <div
          v-for="id in resultIds"
          :key="id"
          class="note-link-chip"
          :style="{ '--chip-color': getNoteColor(id) }"
          @click.stop="navigateTo(id)"
        >
          <div class="link-chip-chevron">
            <span v-if="getTypeLabel(id)" class="link-chip-type">{{ getTypeLabel(id) }}</span>
          </div>
          <span class="link-chip-title">{{ getNoteTitle(id) }}</span>
        </div>
      </div>

      <!-- Full mode -->
      <div v-else class="note-links-full search-results-full">
        <template v-for="id in resultIds" :key="id">
          <div v-if="!ancestorIds.has(id) && getNote(id)" class="linked-note-wrapper">
            <NoteComponent
              :note="getNote(id)!"
              :spatial="false"
              :linkedView="true"
              :depth="depth + 1"
            />
          </div>
        </template>
      </div>
    </template>

    <div v-else-if="hasSearched && query.trim()" class="search-no-results">
      No matches found
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import type { Note } from '../types/note'
import { NODE_TYPES, getNoteColor as getNoteColorFn } from '../types/note'
import { appStore } from '../stores/app'
import { searchResults, runSearch } from '../stores/search'
import { getNoteTitleText } from '../utils/platform'
import NoteComponent from './NoteComponent.vue'

const MAX_FULL_DEPTH = 3

const props = withDefaults(defineProps<{
  note: Note
  depth?: number
}>(), {
  depth: 0,
})

const ancestorIds = inject<Set<string>>('linkAncestorIds', new Set())

const searchInput = ref<HTMLInputElement | null>(null)
const query = ref(props.note.searchQuery || '')
const hasSearched = ref(!!props.note.searchQuery)

const viewMode = computed(() => {
  if (props.depth >= MAX_FULL_DEPTH && props.note.linkViewMode === 'full') return 'brief'
  return props.note.linkViewMode || 'brief'
})

const resultIds = computed(() => {
  return searchResults.get(props.note.id) || []
})

function getNote(id: string): Note | undefined {
  return appStore.notes.get(id)
}

function getNoteTitle(id: string): string {
  const note = appStore.notes.get(id)
  return note ? getNoteTitleText(note.head.content) : 'Deleted'
}

function getNoteColor(id: string): string {
  const note = appStore.notes.get(id)
  return note ? getNoteColorFn(note.color.value) : '#888'
}

function getTypeLabel(id: string): string {
  const note = appStore.notes.get(id)
  const nodeType = note?.nodeType || 'default'
  return NODE_TYPES[nodeType]?.label || ''
}

function navigateTo(id: string) {
  if (appStore.notes.has(id)) {
    appStore.selectNote(id, false)
    appStore.focusNoteId.value = id
  }
}

function doSearch() {
  const q = query.value.trim()
  props.note.searchQuery = q
  appStore.markNoteDirty(props.note, 300)
  runSearch(props.note.id, q)
  hasSearched.value = true
}

// Run search on mount if there's a saved query
onMounted(() => {
  if (props.note.searchQuery) {
    runSearch(props.note.id, props.note.searchQuery)
  }
})
</script>

<style>
.note-search-section {
  border-top: 1px solid var(--divider);
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
}

.search-icon {
  flex-shrink: 0;
  opacity: 0.4;
}

.search-field {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.85em;
  color: var(--text-primary);
  outline: none;
}

.search-field:focus {
  border-color: var(--accent);
}

.search-count {
  font-size: 0.72em;
  font-weight: 600;
  color: var(--text-faint);
  background: var(--bg-surface-hover);
  padding: 1px 6px;
  border-radius: 8px;
  flex-shrink: 0;
}

.search-no-results {
  font-size: 0.8em;
  color: var(--text-faint);
  padding: 6px 12px;
  font-style: italic;
}

/* Results containers inherit link styles */
.search-results-tags {
  padding: 4px 8px;
}

.search-results-brief {
  padding: 4px 6px;
}

.search-results-brief .note-link-chip {
  cursor: pointer;
}

.search-results-full {
  padding: 4px;
}
</style>
