<template>
  <div
    :id="`note-${note.id}`"
    class="note-outer"
    :class="{
      collapsed: note.collapsed,
      'in-list': !spatial,
      'is-selected': isSelected,
      'is-editing': isEditing,
      'is-dragging': isDragVisual,
      'drop-target': isDropTarget,
      'file-note': isFileLink,
    }"
    :style="noteStyle"
    @pointerdown="onPointerDown"
    @dblclick.stop="onDoubleClick"
    @contextmenu.prevent.stop="showContextMenu"
  >
    <div class="note-frame" :class="{ 'has-collapse': hasMultipleSections }">
      <!-- Node type header bar -->
      <div class="node-type-bar">
        <template v-if="(NODE_TYPES[note.nodeType || 'default'] || NODE_TYPES.default).label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path :d="(NODE_TYPES[note.nodeType || 'default'] || NODE_TYPES.default).icon" />
          </svg>
          <span class="node-type-label">{{ (NODE_TYPES[note.nodeType || 'default'] || NODE_TYPES.default).label }}</span>
        </template>

        <!-- Link icon — right-aligned in header bar -->
        <button
          v-if="note.container.enabled"
          class="container-add-btn"
          @pointerdown.stop
          @click.stop="addToContainer"
          title="Add note to container"
        >+</button>

        <div
          v-if="note.link"
          class="note-link-icon"
          @pointerdown.stop
          @click.stop="followLink"
          :title="linkTitle"
        >
          <!-- File: open-folder action icon / missing file icon -->
          <svg v-if="isFileLink && fileMissing" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e03131" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <line x1="9" y1="13" x2="15" y2="19" />
            <line x1="15" y1="13" x2="9" y2="19" />
          </svg>
          <svg v-else-if="isFileLink" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1" />
            <path d="M20 14H9a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h9l3-5z" />
          </svg>
          <!-- Page link: internal page icon -->
          <svg v-else-if="isPageLink" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
            <path d="M14 2v5h5" />
            <path d="M9 13h6" />
            <path d="M9 17h3" />
          </svg>
          <!-- URL: external link icon -->
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>
      </div>

      <!-- Collapse toggle -->
      <button
        v-if="hasMultipleSections"
        class="collapse-toggle"
        :class="{ collapsed: note.collapsed }"
        @pointerdown.stop
        @click.stop="toggleCollapse"
        title="Toggle collapse"
      >
        <svg width="14" height="14" viewBox="0 0 10 10">
          <path
            :d="note.collapsed ? 'M3 1 L7 5 L3 9' : 'M1 3 L5 7 L9 3'"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <!-- Sections -->
      <NoteTextSection :note="note" sectionName="head" />

      <!-- Auto body section -->
      <div v-if="hasAutoBody" class="section-header" @click.stop="toggleSectionFold('autoBody')">
        <svg class="section-chevron" :class="{ folded: isFolded('autoBody') }" width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="section-header-label">Data</span>
      </div>
      <NoteTextSection v-if="hasAutoBody && !isFolded('autoBody')" :note="note" sectionName="autoBody" />

      <!-- User body section -->
      <div v-if="note.body.enabled" class="section-header" @click.stop="toggleSectionFold('body')">
        <svg class="section-chevron" :class="{ folded: isFolded('body') }" width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="section-header-label">Notes</span>
      </div>
      <NoteTextSection v-if="note.body.enabled && !isFolded('body')" :note="note" sectionName="body" />

      <!-- Container section -->
      <div v-if="hasContainer" class="section-header" @click.stop="toggleSectionFold('container')">
        <svg class="section-chevron" :class="{ folded: isFolded('container') }" width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="section-header-count">{{ containerChildCount }} item{{ containerChildCount !== 1 ? 's' : '' }}</span>
      </div>
      <NoteContainer v-if="!isFolded('container')" :note="note" :depth="depth" />

      <!-- Links section -->
      <div v-if="hasLinks" class="section-header" @click.stop="toggleSectionFold('links')">
        <svg class="section-chevron" :class="{ folded: isFolded('links') }" width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="section-header-count">{{ noteLinks.length }} link{{ noteLinks.length !== 1 ? 's' : '' }}</span>
      </div>
      <NoteLinks v-if="!isFolded('links')" :note="note" />
    </div>

    <!-- Resize handles (spatial, selected, not editing) -->
    <template v-if="spatial && note.resizable && isSelected && !isEditing">
      <div class="resize-handle resize-e" @pointerdown.stop="onResizeStart('e', $event)" />
      <div class="resize-handle resize-w" @pointerdown.stop="onResizeStart('w', $event)" />
      <div class="resize-handle resize-s" @pointerdown.stop="onResizeStart('s', $event)" />
      <div class="resize-handle resize-se" @pointerdown.stop="onResizeStart('se', $event)" />
    </template>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="contextMenuVisible"
        ref="contextMenuRef"
        class="context-menu"
        :style="{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }"
        @pointerdown.stop
      >
        <button @click="toggleSection('body')">
          {{ note.body.enabled ? '✓ ' : '' }}Body
        </button>
        <button @click="toggleSection('container')">
          {{ note.container.enabled ? '✓ ' : '' }}Container
        </button>
        <template v-if="note.container.enabled">
          <button @click="toggleContainerLayout">
            Layout: {{ (note.container.layout || 'list') === 'columns' ? 'Columns' : 'List' }}
          </button>
        </template>
        <div class="context-separator" />
        <div class="context-colors">
          <button
            v-for="name in NOTE_COLOR_NAMES"
            :key="name"
            class="color-swatch"
            :class="{ active: note.color.value === name }"
            :style="{ backgroundColor: `var(--note-${name})` }"
            @click="setColor(name as string)"
          />
        </div>
        <div class="context-separator" />
        <div class="context-submenu">
          <button @click="toggleTypePicker" class="submenu-trigger">
            Type: {{ (NODE_TYPES[note.nodeType || 'default'] || NODE_TYPES.default).label || 'Default' }} ▸
          </button>
          <div v-if="typePickerVisible" class="submenu-panel type-picker-panel" @pointerdown.stop>
            <button
              v-for="key in NODE_TYPE_KEYS"
              :key="key"
              :class="{ active: (note.nodeType || 'default') === key }"
              @click="setNodeType(key)"
            >
              <svg v-if="NODE_TYPES[key].icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path :d="NODE_TYPES[key].icon" />
              </svg>
              {{ NODE_TYPES[key].label || 'Default' }}
            </button>
          </div>
        </div>
        <button v-if="note.width !== 'auto' || note.height !== 'auto'" @click="resetSize">Reset size</button>
        <div class="context-separator" />
        <template v-if="!isFileLink">
          <div class="context-submenu">
            <button @click="togglePagePicker" class="submenu-trigger">
              {{ note.link ? '✓ ' : '' }}Link to page ▸
            </button>
            <div v-if="pagePickerVisible" class="submenu-panel" @pointerdown.stop>
              <input
                type="text"
                class="submenu-search"
                v-model="pagePickerSearch"
                placeholder="Search pages…"
                spellcheck="false"
                ref="pagePickerInput"
              />
              <div class="submenu-list">
                <button
                  v-for="page in filteredAvailablePages"
                  :key="page.id"
                  :class="{ active: note.link === page.id }"
                  @click="setPageLink(page.id)"
                >
                  {{ page.title }}
                </button>
                <div v-if="filteredAvailablePages.length === 0" class="submenu-empty">
                  {{ availablePages.length === 0 ? 'No other pages' : 'No matches' }}
                </div>
              </div>
            </div>
          </div>
          <button @click="addUrlLink">
            {{ isUrlLink ? '✓ ' : '' }}Link to URL…
          </button>
        </template>
        <button v-if="note.link" @click="removeLink" class="danger">Remove link</button>
        <template v-if="isFileLink">
          <div class="context-separator" />
          <button @click="analyzeFile('quick')" :disabled="analyzing">
            {{ analyzing ? 'Analyzing…' : '🔍 Quick analyze' }}
          </button>
          <button @click="analyzeFile('full')" :disabled="analyzing">
            {{ analyzing ? 'Analyzing…' : '🔬 Full analyze' }}
          </button>
          <button @click="openLoudnessDialog" :disabled="analyzing">
            📊 Loudness analysis…
          </button>
        </template>
        <div class="context-separator" />
        <button @click="togglePin">{{ isPinned ? 'Unpin note' : 'Pin note' }}</button>
        <button @click="startLinkFromHere">Create link…</button>
        <button v-if="!note.link" @click="convertToPage">Convert to page</button>
        <div class="context-separator" />
        <button class="danger" @click="onDelete">Delete note</button>
      </div>
    </Teleport>

    <!-- Loudness analysis dialog -->
    <LoudnessDialog
      v-if="loudnessDialogVisible"
      :note="note"
      :audioStreams="loudnessStreams"
      :duration="loudnessDuration"
      @close="loudnessDialogVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, inject, onBeforeUnmount, nextTick } from 'vue'
import { showInFolder, isLocalPath, toFsPath, openExternal, extractText } from '../utils/platform'
import { NOTE_COLOR_NAMES, getNoteColor, NODE_TYPES, NODE_TYPE_KEYS } from '../types/note'
import type { Note } from '../types/note'
import { replaceAutoSection, appendAutoSection, getSectionBlocks, setSectionBlocks, noteHasAutoBody } from '../utils/autoSections'
import { showToast, clearToast } from '../stores/toast'
import { pinNote, unpinNote, isNotePinned } from '../stores/pinned'
import { appStore } from '../stores/app'
import { history } from '../stores/history'
import { getStorage } from '../stores/state'
import { panes, setActivePane } from '../stores/panes'
import { nanoid } from 'nanoid'
import NoteTextSection from './NoteTextSection.vue'
import NoteContainer from './NoteContainer.vue'
import NoteLinks from './NoteLinks.vue'
import LoudnessDialog from './LoudnessDialog.vue'
import type { ResizeHandle } from '../composables/useResize'

const props = withDefaults(defineProps<{
  note: Note
  parentNoteId?: string
  depth?: number
  spatial?: boolean
}>(), {
  depth: 0,
  spatial: true,
})

// Injected from Canvas
const startDrag = inject<(note: Note, parentNoteId: string | undefined, e: PointerEvent) => void>('startDrag', () => {})
const startResize = inject<(note: Note, handle: ResizeHandle, e: PointerEvent) => void>('startResize', () => {})
const dragTargetId = inject<{ value: string | null }>('dragTargetId', ref(null))
const dropTargetId = inject<{ value: string | null }>('dropTargetId', ref(null))
const activatePane = inject<() => void>('activatePane', () => {})
const isDraggingGlobal = inject<{ value: boolean }>('isDragging', ref(false))

const isEditing = computed(() => appStore.editingNoteId.value === props.note.id)
const isSelected = computed(() => appStore.selectedNoteIds.has(props.note.id))
const isDragTarget = computed(() => dragTargetId.value === props.note.id)
const isDragVisual = computed(() => isDragTarget.value && isDraggingGlobal.value)
const isDropTarget = computed(() => dropTargetId.value === props.note.id)

// Context menu
const contextMenuVisible = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuRef = ref<HTMLElement | null>(null)

const hasMultipleSections = computed(() => {
  let count = 0
  if (props.note.head.enabled) count++
  if (hasAutoBody.value) count++
  if (props.note.body.enabled) count++
  if (props.note.container.enabled) count++
  if (noteLinks.value.length > 0) count++
  return count > 1
})

// Per-section fold helpers
const noteLinks = computed(() => appStore.getLinksForNote(props.note.id))
const hasAutoBody = computed(() => noteHasAutoBody(props.note))
const hasContainer = computed(() => props.note.container.enabled && props.note.container.childIds.length > 0)
const hasLinks = computed(() => noteLinks.value.length > 0)
const containerChildCount = computed(() => props.note.container.childIds.length)

function isFolded(section: 'autoBody' | 'body' | 'container' | 'links'): boolean {
  return props.note.foldState?.[section] ?? false
}

/** Sections currently present on this note (for master toggle logic) */
function presentSections(): ('autoBody' | 'body' | 'container' | 'links')[] {
  const sections: ('autoBody' | 'body' | 'container' | 'links')[] = []
  if (hasAutoBody.value) sections.push('autoBody')
  if (props.note.body.enabled) sections.push('body')
  if (hasContainer.value) sections.push('container')
  if (hasLinks.value) sections.push('links')
  return sections
}

function toggleSectionFold(section: 'autoBody' | 'body' | 'container' | 'links') {
  if (!props.note.foldState) {
    props.note.foldState = { autoBody: false, body: false, container: false, links: false }
  }
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.foldState[section] = !props.note.foldState[section]
  // Sync master collapsed: true only if ALL present sections are folded
  const present = presentSections()
  props.note.collapsed = present.length > 0 && present.every(s => props.note.foldState[s])
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Toggle section fold')
}

const noteColor = computed(() => {
  if (props.note.color.inherit) return undefined
  return getNoteColor(props.note.color.value)
})

const noteStyle = computed(() => {
  const style: Record<string, string> = {}

  if (props.spatial) {
    style.position = 'absolute'
    style.left = '0'
    style.top = '0'
    style.transform = `translate(${props.note.pos.x}px, ${props.note.pos.y}px)`
    style.zIndex = `${props.note.zIndex}`
    style.willChange = isDragTarget.value ? 'transform' : 'auto'
  }

  if (props.note.width && props.note.width !== 'auto') {
    style.width = `${props.note.width}px`
  } else if (props.spatial) {
    style.width = 'max-content'
    style.minWidth = '240px'
    style.maxWidth = '600px'
  }

  if (props.note.height && props.note.height !== 'auto') {
    style.height = `${props.note.height}px`
  }

  if (noteColor.value) {
    style['--note-color'] = noteColor.value
    style['--note-bg'] = `color-mix(in srgb, ${noteColor.value} 15%, var(--note-bg-base))`
    style['--note-border'] = `color-mix(in srgb, ${noteColor.value} 30%, var(--note-border-base))`
  }

  return style
})

function onPointerDown(e: PointerEvent) {
  // Middle click: let it bubble up to canvas for panning
  if (e.button === 1) return

  if (e.button !== 0) return
  activatePane()
  e.stopPropagation()

  // Linking mode: clicking a note completes the link
  if (appStore.linkingSourceId.value) {
    appStore.completeLinking(props.note.id)
    return
  }

  // If this note is being edited, let Tiptap handle events (text selection etc.)
  if (isEditing.value) return

  // Exit any other note's editing
  if (appStore.editingNoteId.value) {
    appStore.clearEditing()
  }

  // Selection logic (following selection pattern)
  const isCtrl = e.ctrlKey || e.metaKey

  if (isCtrl) {
    // Ctrl+click: toggle selection
    appStore.toggleNoteSelection(props.note.id)
  } else if (!isSelected.value) {
    // Click on unselected: select it (clear others)
    appStore.selectNote(props.note.id, false)
  }
  // If already selected without Ctrl: keep selection, just drag

  // Start drag if the note is now selected
  if (appStore.isSelected(props.note.id)) {
    e.preventDefault()
    startDrag(props.note, props.parentNoteId, e)
  }
}

function onDoubleClick(e: MouseEvent) {
  if (isEditing.value) return
  appStore.setEditingNote(props.note.id)
}

function onResizeStart(handle: ResizeHandle, e: PointerEvent) {
  startResize(props.note, handle, e)
}

/** Unfold a specific section (and master collapsed flag) without creating undo action */
function unfoldSection(section: 'autoBody' | 'body' | 'container' | 'links') {
  if (!props.note.foldState) {
    props.note.foldState = { autoBody: false, body: false, container: false, links: false }
  }
  props.note.foldState[section] = false
  props.note.collapsed = false
}

function toggleCollapse() {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  if (!props.note.foldState) {
    props.note.foldState = { autoBody: false, body: false, container: false, links: false }
  }
  const present = presentSections()
  if (present.length === 0) {
    // No foldable sections — just toggle the legacy boolean
    props.note.collapsed = !props.note.collapsed
  } else {
    const allFolded = present.every(s => props.note.foldState[s])
    const allUnfolded = present.every(s => !props.note.foldState[s])
    if (allFolded) {
      // All folded → unfold all
      for (const s of present) props.note.foldState[s] = false
      props.note.collapsed = false
    } else {
      // Mixed or all unfolded → fold all
      for (const s of present) props.note.foldState[s] = true
      props.note.collapsed = true
    }
  }
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Toggle collapse')
}

function addToContainer() {
  if (!props.note.container.enabled) return
  const isColumns = (props.note.container.layout || 'list') === 'columns'

  if (isColumns) {
    appStore.createNote({ x: 0, y: 0 }, props.note.id, {
      startEditing: true,
      enableBody: false,
      enableContainer: true,
      containerLayout: 'list',
    })
  } else {
    appStore.createNote({ x: 0, y: 0 }, props.note.id)
  }

  // Auto-expand if collapsed
  if (props.note.collapsed) {
    const before = history.snapshotNote(appStore.notes, props.note.id)!
    const present = presentSections()
    for (const s of present) unfoldSection(s)
    props.note.collapsed = false
    appStore.updateNote(props.note)
    appStore.pushNotePropertyAction(props.note.id, before, 'Expand note')
  }
}

let contextMenuCleanup: (() => void) | null = null

function closeContextMenu() {
  contextMenuVisible.value = false
  pagePickerVisible.value = false
  typePickerVisible.value = false
  if (contextMenuCleanup) {
    contextMenuCleanup()
    contextMenuCleanup = null
  }
}

function showContextMenu(e: MouseEvent) {
  if (!isSelected.value) {
    appStore.selectNote(props.note.id, false)
  }

  contextMenuPos.value = { x: e.clientX, y: e.clientY }
  contextMenuVisible.value = true
  pagePickerVisible.value = false
  typePickerVisible.value = false

  // Clamp to viewport after render
  nextTick(() => {
    const el = contextMenuRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    let { x, y } = contextMenuPos.value
    if (rect.right > window.innerWidth - pad) x = window.innerWidth - rect.width - pad
    if (rect.bottom > window.innerHeight - pad) y = window.innerHeight - rect.height - pad
    if (x < pad) x = pad
    if (y < pad) y = pad
    contextMenuPos.value = { x, y }
  })

  // Clean up any previous listeners
  if (contextMenuCleanup) contextMenuCleanup()

  const close = (ev: Event) => {
    // Don't close if interacting with elements inside the context menu (except Escape)
    if (ev instanceof KeyboardEvent && ev.key !== 'Escape') {
      const menu = document.querySelector('.context-menu')
      if (menu && ev.target instanceof Node && menu.contains(ev.target)) return
    }
    // Don't close on pointerdown inside the context menu itself
    if (ev.type === 'pointerdown') {
      const menu = document.querySelector('.context-menu')
      if (menu && ev.target instanceof Node && menu.contains(ev.target)) return
    }

    closeContextMenu()
  }

  contextMenuCleanup = () => {
    window.removeEventListener('pointerdown', close, true)
    window.removeEventListener('keydown', close)
  }

  setTimeout(() => {
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close)
  }, 0)
}

onBeforeUnmount(() => {
  closeContextMenu()
})

function toggleSection(section: 'body' | 'container') {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note[section].enabled = !props.note[section].enabled
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, `Toggle ${section}`)
  closeContextMenu()
}

function toggleContainerLayout() {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.container.layout = (props.note.container.layout || 'list') === 'columns' ? 'list' : 'columns'
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Toggle container layout')
  closeContextMenu()
}

function setColor(color: string) {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.color.value = color
  props.note.color.inherit = false
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Change color')
  closeContextMenu()
}

function resetSize() {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.width = 'auto'
  props.note.height = 'auto'
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Reset size')
  closeContextMenu()
}

// Page picker
const pagePickerVisible = ref(false)
const pagePickerSearch = ref('')
const pagePickerInput = ref<HTMLInputElement | null>(null)

// Node type picker
const typePickerVisible = ref(false)

function clampSubmenu(el: HTMLElement | null) {
  if (!el) return
  // Reset any previous flip
  el.style.left = ''
  el.style.right = ''
  el.style.top = ''
  const rect = el.getBoundingClientRect()
  const pad = 8
  if (rect.right > window.innerWidth - pad) {
    el.style.left = 'auto'
    el.style.right = '100%'
  }
  if (rect.bottom > window.innerHeight - pad) {
    const overflow = rect.bottom - window.innerHeight + pad
    el.style.top = `${-overflow}px`
  }
}

function toggleTypePicker() {
  typePickerVisible.value = !typePickerVisible.value
  if (typePickerVisible.value) {
    nextTick(() => {
      const el = document.querySelector('.type-picker-panel') as HTMLElement
      clampSubmenu(el)
    })
  }
}

function setNodeType(typeKey: string) {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.nodeType = typeKey
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Change node type')
  closeContextMenu()
}

const availablePages = computed(() => {
  return appStore.pageList.value.filter(p => p.id !== appStore.currentPageId.value)
})

const filteredAvailablePages = computed(() => {
  const q = pagePickerSearch.value.toLowerCase().trim()
  if (!q) return availablePages.value
  return availablePages.value.filter(p =>
    (p.title || 'Untitled').toLowerCase().includes(q)
  )
})

const isUrlLink = computed(() => {
  if (!props.note.link) return false
  return props.note.link.includes('://') || props.note.link.startsWith('/') || /^[A-Z]:[\\\/]/.test(props.note.link)
})

const isFileLink = computed(() => {
  return isUrlLink.value && isLocalPath(props.note.link)
})

const isPageLink = computed(() => {
  return !!props.note.link && !isUrlLink.value
})

const fileMissing = ref(false)

// Reset fileMissing when link changes (e.g. file replacement)
watch(() => props.note.link, () => {
  fileMissing.value = false
})

const linkTitle = computed(() => {
  if (!props.note.link) return ''
  if (isFileLink.value) return `Open folder: ${props.note.link}`
  if (isUrlLink.value) return `Open: ${props.note.link}`
  const page = appStore.pageList.value.find(p => p.id === props.note.link)
  return page ? `Go to: ${page.title}` : 'Linked page no longer exists (click to remove)'
})

function togglePagePicker() {
  pagePickerVisible.value = !pagePickerVisible.value
  if (pagePickerVisible.value) {
    pagePickerSearch.value = ''
    setTimeout(() => pagePickerInput.value?.focus(), 0)
    nextTick(() => {
      const panels = document.querySelectorAll('.submenu-panel:not(.type-picker-panel)')
      const el = panels[panels.length - 1] as HTMLElement
      clampSubmenu(el)
    })
  }
}

function setPageLink(pageId: string) {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  if (props.note.link === pageId) {
    props.note.link = ''
  } else {
    props.note.link = pageId
  }
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Set page link')
  closeContextMenu()
}

function addUrlLink() {
  const url = prompt('Enter URL:', isUrlLink.value ? props.note.link : 'https://')
  if (url !== null && url.trim()) {
    const before = history.snapshotNote(appStore.notes, props.note.id)!
    props.note.link = url.trim()
    appStore.updateNote(props.note)
    appStore.pushNotePropertyAction(props.note.id, before, 'Set URL link')
  }
  closeContextMenu()
}

function removeLink() {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.link = ''
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Remove link')
  closeContextMenu()
}

async function convertToPage() {
  closeContextMenu()

  // Extract title from head section text
  const headText = extractText(props.note.head.content).trim()
  const title = headText || 'Untitled'

  // Create a new page
  const page = await appStore.createPage(title)

  // Link this note to the new page
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.link = page.id
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Convert to page')

  // Navigate to the new page (push history so breadcrumbs work)
  await appStore.navigateToPage(page.id, true)
}

async function followLink() {
  if (!props.note.link) return

  if (isFileLink.value) {
    // Check file exists before trying to reveal
    const fsPath = toFsPath(props.note.link)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const exists: boolean = await invoke('path_exists', { path: fsPath })
      if (!exists) {
        fileMissing.value = true
        return
      }
    } catch {}

    fileMissing.value = false
    const opened = await showInFolder(fsPath)
    if (!opened) {
      try {
        await navigator.clipboard.writeText(fsPath)
      } catch {}
    }
  } else if (isUrlLink.value) {
    await openExternal(props.note.link)
  } else {
    // Page link — verify it still exists
    const page = appStore.pageList.value.find(p => p.id === props.note.link)
    if (page) {
      // Check if the target page is already open in another pane
      let targetPane = null
      for (const pane of panes.values()) {
        if (pane.pageId === props.note.link) {
          targetPane = pane
          break
        }
      }
      if (targetPane) {
        // Target page is open — activate that pane and focus
        setActivePane(targetPane.id)
      } else {
        // Navigate in the active pane
        appStore.navigateToPage(props.note.link)
      }
    } else {
      // Dead link — clean it up
      const before = history.snapshotNote(appStore.notes, props.note.id)!
      props.note.link = ''
      appStore.updateNote(props.note)
      appStore.pushNotePropertyAction(props.note.id, before, 'Remove dead link')
    }
  }
}

function startLinkFromHere() {
  closeContextMenu()
  appStore.startLinking(props.note.id)
}

const isPinned = computed(() => isNotePinned(props.note.id))

function togglePin() {
  if (isPinned.value) {
    unpinNote(props.note.id)
  } else {
    pinNote(props.note.id)
  }
  closeContextMenu()
}

function onDelete() {
  closeContextMenu()
  appStore.deleteNote(props.note.id, props.parentNoteId)
}

const analyzing = ref(false)
const loudnessDialogVisible = ref(false)
const loudnessStreams = ref<any[]>([])
const loudnessDuration = ref(0)

async function openLoudnessDialog() {
  closeContextMenu()
  if (!isFileLink.value) return

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const fsPath = toFsPath(props.note.link!)
    const result = await invoke<string>('run_ffprobe', {
      path: fsPath,
      args: ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format'],
    })
    const data = JSON.parse(result)
    const audioStreams = (data.streams || []).filter((s: any) => s.codec_type === 'audio')
    if (audioStreams.length === 0) {
      showToast('No audio streams found')
      return
    }
    loudnessStreams.value = audioStreams
    loudnessDuration.value = parseFloat(data.format?.duration || '0')
    loudnessDialogVisible.value = true
  } catch (e) {
    console.error('Failed to probe for loudness:', e)
    showToast('Failed to read audio streams')
  }
}

async function analyzeFile(mode: 'quick' | 'full' = 'quick') {
  if (!isFileLink.value || analyzing.value) return
  analyzing.value = true
  showToast('Analyzing…', 0)
  closeContextMenu()

  try {
    const { invoke } = await import('@tauri-apps/api/core')

    // Check file exists first
    const exists: boolean = await invoke('path_exists', { path: props.note.link })
    if (!exists) {
      const before = history.snapshotNote(appStore.notes, props.note.id)!
      replaceAutoSection(props.note, 'Analysis', [{
        type: 'paragraph',
        content: [{ type: 'text', text: '⚠ File not found — may have been moved or deleted' }],
      }])
      unfoldSection('autoBody')
      appStore.updateNote(props.note)
      appStore.pushNotePropertyAction(props.note.id, before, 'Analyze media')
      fileMissing.value = true
      analyzing.value = false
      clearToast()
      return
    }

    const result = await invoke<string>('run_ffprobe', {
      path: props.note.link,
      args: [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
      ],
    })

    const probe = JSON.parse(result.trim())
    const streams: any[] = probe.streams || []
    const format = probe.format || {}

    const lines: string[] = []

    // Duration
    const duration = parseFloat(format.duration || '0')
    if (duration > 0) {
      const h = Math.floor(duration / 3600)
      const m = Math.floor((duration % 3600) / 60)
      const s = Math.floor(duration % 60)
      const f = Math.round((duration % 1) * 100)
      const parts = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
      lines.push(`Duration: ${parts}.${String(f).padStart(2, '0')}`)
    }

    // File size
    const bytes = parseInt(format.size || '0', 10)
    if (bytes > 0) {
      lines.push(`Size: ${formatFileSize(bytes)}`)
    }

    // Find first video and audio streams
    const videoStream = streams.find((s: any) => s.codec_type === 'video' && s.codec_name !== 'mjpeg')
    const audioStreams = streams.filter((s: any) => s.codec_type === 'audio')
    const dataStreams = streams.filter((s: any) => s.codec_type === 'data' || s.codec_type === 'subtitle')

    // Video codec
    if (videoStream) {
      const profile = videoStream.profile && videoStream.profile !== 'unknown' ? ` ${videoStream.profile}` : ''
      const res = videoStream.width && videoStream.height ? ` (${videoStream.width}×${videoStream.height})` : ''
      lines.push(`Video: ${videoStream.codec_name}${profile}${res}`)
      if (videoStream.pix_fmt) {
        lines.push(`Pixel format: ${videoStream.pix_fmt}`)
      }
    }

    // Audio codec (first stream's codec as summary)
    if (audioStreams.length > 0) {
      lines.push(`Audio: ${audioStreams[0].codec_name}`)
    }

    // Start timecode — check format tags, then video stream tags
    const startTc = format.tags?.timecode
      || videoStream?.tags?.timecode
      || streams.find((s: any) => s.codec_type === 'data' && s.tags?.timecode)?.tags?.timecode
    if (startTc) {
      lines.push(`Start TC: ${startTc}`)
    }

    // Framerate
    if (videoStream) {
      const fps = parseFrameRate(videoStream.r_frame_rate || videoStream.avg_frame_rate)
      if (fps) lines.push(`FPS: ${fps}`)
    }

    // Color info
    if (videoStream) {
      const cs = videoStream.color_space
      const ct = videoStream.color_transfer
      const cp = videoStream.color_primaries
      const cr = videoStream.color_range

      if (cs && cs !== 'unknown') lines.push(`Colorspace: ${cs}`)
      if (ct && ct !== 'unknown') {
        const eotfNames: Record<string, string> = {
          'smpte2084': 'PQ (HDR10)',
          'arib-std-b67': 'HLG',
          'bt709': 'BT.709 (SDR)',
          'iec61966-2-1': 'sRGB',
          'linear': 'Linear',
          'smpte240m': 'SMPTE 240M',
          'bt2020-10': 'BT.2020 10-bit',
          'bt2020-12': 'BT.2020 12-bit',
          'gamma22': 'Gamma 2.2',
          'gamma28': 'Gamma 2.8',
        }
        lines.push(`EOTF: ${eotfNames[ct] || ct}`)
      }
      if (cp && cp !== 'unknown') lines.push(`Primaries: ${cp}`)
      if (cr && cr !== 'unknown') lines.push(`Range: ${cr === 'tv' ? 'Limited' : cr === 'pc' ? 'Full' : cr}`)
    }

    // Data/metadata tracks
    if (dataStreams.length > 0) {
      lines.push('')
      lines.push(`Metadata tracks (${dataStreams.length}):`)
      for (let i = 0; i < dataStreams.length; i++) {
        const d = dataStreams[i]
        const name = d.tags?.handler_name || d.codec_tag_string || d.codec_name || 'unknown'
        const tc = d.tags?.timecode ? ` (TC: ${d.tags.timecode})` : ''
        lines.push(`  ${i + 1}. ${name}${tc}`)
      }
    }

    // Audio track list
    if (audioStreams.length > 0) {
      lines.push('')
      lines.push(`Audio tracks (${audioStreams.length}):`)
      for (let i = 0; i < audioStreams.length; i++) {
        const a = audioStreams[i]
        const layout = describeAudioLayout(a)
        const lang = a.tags?.language && a.tags.language !== 'und' ? ` [${a.tags.language}]` : ''
        const title = a.tags?.title ? ` — ${a.tags.title}` : ''
        lines.push(`  ${i + 1}. ${a.codec_name} ${layout}${lang}${title}`)
      }
    }

    if (lines.length === 0) {
      lines.push('No media streams found')
    }

    // Show text analysis — replaces previous analysis on re-run
    const before = history.snapshotNote(appStore.notes, props.note.id)!

    const newBlocks: any[] = lines.map(line => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    }))

    replaceAutoSection(props.note, 'Analysis', newBlocks)
    unfoldSection('autoBody')

    appStore.updateNote(props.note)
    appStore.pushNotePropertyAction(props.note.id, before, 'Analyze media')
    analyzing.value = false

    // Generate waveform images in background (full analyze only)
    if (mode === 'full' && audioStreams.length > 0) {
      showToast('Generating waveforms…', 0)
      const noteId = props.note.id
      const filePath = props.note.link!
      const storage = getStorage()
      const vaultPath = storage.getVaultPath()
      const waveformColor = '#0b7285'
      const total = audioStreams.length

      // Insert progress status into Analysis section
      const current0 = appStore.notes.get(noteId)
      if (current0) {
        appendAutoSection(current0, 'Analysis', [{
          type: 'paragraph',
          content: [{ type: 'text', text: `⏳ Generating waveforms (0/${total})…` }],
        }])
        appStore.updateNote(current0)
      }

      // Fire and forget — each waveform appends itself when done
      ;(async () => {
        for (let i = 0; i < audioStreams.length; i++) {
          const note = appStore.notes.get(noteId)
          if (!note) break // note was deleted

          const a = audioStreams[i]
          const layout = describeAudioLayout(a)
          const lang = a.tags?.language && a.tags.language !== 'und' ? ` [${a.tags.language}]` : ''
          const title = a.tags?.title ? ` — ${a.tags.title}` : ''
          const label = `${i + 1}. ${a.codec_name} ${layout}${lang}${title}`
          const filename = `waveform_${nanoid(8)}.png`

          const channels = parseInt(a.channels || '2', 10)
          const height = Math.max(60, channels * 30)

          try {
            await invoke('generate_waveform', {
              vaultPath,
              filePath,
              trackIndex: i,
              filename,
              width: 600,
              height,
              color: waveformColor,
            })

            // Update progress and append waveform within Analysis section
            const current = appStore.notes.get(noteId)
            if (!current) break
            const sectionBlocks = getSectionBlocks(current, 'Analysis') || []

            // Find and update the progress paragraph
            const progressIdx = sectionBlocks.findIndex((b: any) =>
              b.content?.[0]?.text?.startsWith('⏳ Generating waveforms')
            )
            if (progressIdx >= 0) {
              if (i < total - 1) {
                sectionBlocks[progressIdx] = {
                  type: 'paragraph',
                  content: [{ type: 'text', text: `⏳ Generating waveforms (${i + 1}/${total})…` }],
                }
              } else {
                // Last one — remove progress line
                sectionBlocks.splice(progressIdx, 1)
              }
            }

            sectionBlocks.push({
              type: 'paragraph',
              content: [{ type: 'text', text: `🔊 ${label}`, marks: [{ type: 'bold' }] }],
            })
            sectionBlocks.push({
              type: 'image',
              attrs: { src: filename },
            })
            setSectionBlocks(current, 'Analysis', sectionBlocks)
            appStore.updateNote(current)
          } catch (e) {
            console.warn(`[waveform] Failed for track ${i}:`, e)
          }
        }

        // Clean up progress line if still present (e.g. all failed)
        const final_ = appStore.notes.get(noteId)
        if (final_) {
          const sectionBlocks = getSectionBlocks(final_, 'Analysis') || []
          const idx = sectionBlocks.findIndex((b: any) =>
            b.content?.[0]?.text?.startsWith('⏳ Generating waveforms')
          )
          if (idx >= 0) {
            sectionBlocks.splice(idx, 1)
            setSectionBlocks(final_, 'Analysis', sectionBlocks)
            appStore.updateNote(final_)
          }
        }
        clearToast()
      })()
    } else {
      clearToast()
    }
    return // skip the finally block's analyzing=false since we already set it
  } catch (e: any) {
    console.error('ffprobe failed:', e)
    // Show error in the note autoBody
    try {
      const before = history.snapshotNote(appStore.notes, props.note.id)!
      const msg = String(e).includes('ffprobe') ? '⚠ ffprobe not found — is FFmpeg installed?' : `⚠ Analysis failed: ${e}`
      replaceAutoSection(props.note, 'Analysis', [{
        type: 'paragraph',
        content: [{ type: 'text', text: msg }],
      }])
      unfoldSection('autoBody')
      appStore.updateNote(props.note)
      appStore.pushNotePropertyAction(props.note.id, before, 'Analyze media')
    } catch { /* ignore */ }
  }
  analyzing.value = false
  clearToast()
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

function parseFrameRate(rateStr: string): string | null {
  if (!rateStr) return null
  const parts = rateStr.split('/')
  if (parts.length === 2) {
    const num = parseInt(parts[0], 10)
    const den = parseInt(parts[1], 10)
    if (den === 0) return null
    const fps = num / den
    // Show common NTSC rates nicely
    const rounded2 = Math.round(fps * 100) / 100
    if (Math.abs(fps - Math.round(fps)) < 0.01) return `${Math.round(fps)}`
    return `${rounded2}`
  }
  return rateStr
}

function describeAudioLayout(stream: any): string {
  const layout = stream.channel_layout
  if (layout) {
    const map: Record<string, string> = {
      'mono': 'Mono',
      'stereo': 'Stereo',
      '5.1': '5.1',
      '5.1(side)': '5.1',
      '7.1': '7.1',
      '7.1(wide)': '7.1',
      'quad': 'Quad',
    }
    return map[layout] || layout
  }
  const ch = stream.channels
  if (ch === 1) return 'Mono'
  if (ch === 2) return 'Stereo'
  if (ch === 6) return '5.1'
  if (ch === 8) return '7.1'
  if (ch) return `${ch}ch`
  return ''
}

function extractPlainText(content: any): string {
  if (!content?.content) return ''
  return content.content
    .map((block: any) => {
      if (!block.content) return ''
      return block.content.map((node: any) => node.text || '').join('')
    })
    .filter((s: string) => s.length > 0)
    .join('\n')
}
</script>

<style>
.note-outer {
  --note-color: var(--note-default-color);
  --note-bg: color-mix(in srgb, var(--note-color) 15%, var(--note-bg-base));
  --note-border: color-mix(in srgb, var(--note-color) 30%, var(--note-border-base));

  position: relative;
  min-width: 80px;
  cursor: grab;
  user-select: none;
  contain: layout style;
}

.note-outer:active:not(.is-editing) {
  cursor: grabbing;
}

.note-outer.is-editing {
  cursor: auto;
  user-select: auto;
}

.note-outer.is-dragging {
  opacity: 0.7;
  z-index: 99999 !important;
}

.note-outer.drop-target > .note-frame {
  box-shadow: 0 0 0 calc(2px / var(--canvas-scale, 1)) var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 30%, transparent);
}

/* File reference note — type bar now handles visual distinction */

.note-outer.in-list {
  position: relative;
  cursor: grab;
}

.note-outer.in-list.is-editing {
  cursor: auto;
}

.note-frame {
  background: var(--note-bg);
  border: 1.5px solid var(--note-border);
  border-radius: 6px;
  color: var(--text-primary);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.note-outer:hover:not(.is-selected) > .note-frame {
  box-shadow: 0 0 0 calc(1px / var(--canvas-scale, 1)) var(--note-color), 0 2px 8px rgba(0, 0, 0, 0.25);
}

/* Selected state: blue highlight */
.note-outer.is-selected > .note-frame {
  border-color: var(--accent);
  box-shadow: 0 0 0 calc(1.5px / var(--canvas-scale, 1)) var(--accent), 0 2px 8px rgba(0, 0, 0, 0.25);
}

/* Editing state: stronger blue */
.note-outer.is-editing > .note-frame {
  border-color: var(--accent);
  box-shadow: 0 0 0 calc(2px / var(--canvas-scale, 1)) var(--accent), 0 2px 8px rgba(0, 0, 0, 0.25);
}

/* Node type header bar — Blender-style title strip */
.node-type-bar {
  display: flex;
  align-items: center;
  gap: 0.35em;
  padding: 0.15em 0.5em;
  background: color-mix(in srgb, var(--note-color) 55%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--note-color) 30%, transparent);
  font-size: 0.7em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-primary);
  opacity: 0.85;
  user-select: none;
  flex-shrink: 0;
  min-height: 1.4em;
}

.node-type-bar svg {
  opacity: 0.7;
  flex-shrink: 0;
}

.container-add-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 1.3em;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.3em;
  opacity: 0.35;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.container-add-btn:hover {
  opacity: 0.9;
}

/* When both + and link icon exist, only link gets margin-left:auto */
.container-add-btn + .note-link-icon {
  margin-left: 0;
}

.node-type-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-divider {
  height: 1px;
  background: var(--note-border);
  margin: 0;
  flex-shrink: 0;
}

/* Section fold headers */
.section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  cursor: pointer;
  user-select: none;
  border-top: 1px solid var(--note-border);
  opacity: 0.6;
  transition: opacity 0.1s;
  flex-shrink: 0;
}

.section-header:hover {
  opacity: 1;
}

.section-chevron {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.section-chevron.folded {
  transform: rotate(-90deg);
}

.section-header-label {
  font-size: 0.65em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

.section-header-count {
  font-size: 0.7em;
  color: var(--text-muted);
}

/* When collapse button visible, indent content so arrow doesn't overlap text */
.note-frame.has-collapse > .note-text-section {
  padding-left: 24px;
}

/* Collapse toggle */
.collapse-toggle {
  position: absolute;
  top: 2.2em;  /* below the node-type-bar header */
  left: 2px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0;
  border-radius: 3px;
  z-index: 10;
}

.collapse-toggle:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

/* Link icon */
.note-link-icon {
  margin-left: auto;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 3px;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
}

.note-link-icon:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

/* Context menu submenu */
.context-submenu {
  position: relative;
}

.submenu-trigger {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 6px 12px;
  font-size: 0.82em;
  cursor: pointer;
  border-radius: 4px;
}

.submenu-trigger:hover {
  background: var(--bg-surface-hover);
}

.submenu-panel {
  position: absolute;
  left: 100%;
  top: 0;
  min-width: 200px;
  max-width: 280px;
  background: var(--controls-bg);
  border: 1px solid var(--border-main);
  border-radius: 8px;
  padding: 4px;
  box-shadow: var(--shadow-menu);
  z-index: 10001;
}

.submenu-search {
  width: calc(100% - 8px);
  margin: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  color: var(--text-secondary);
  padding: 5px 8px;
  font-size: 0.8em;
  border-radius: 4px;
  outline: none;
}

.submenu-search:focus {
  border-color: var(--border-input-focus);
}

.submenu-search::placeholder {
  color: var(--text-faint);
}

.submenu-list {
  max-height: 200px;
  overflow-y: auto;
}

.submenu-panel button {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 6px 12px;
  font-size: 0.82em;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.submenu-panel button:hover {
  background: var(--bg-surface-hover);
}

.submenu-panel button.active {
  color: var(--accent);
}

.type-picker-panel button {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-picker-panel button svg {
  opacity: 0.6;
  flex-shrink: 0;
}

.type-picker-panel button.active svg {
  opacity: 1;
}

.submenu-empty {
  padding: 6px 12px;
  font-size: 0.82em;
  color: var(--text-faint);
  font-style: italic;
}

/* Resize handles */
.resize-handle {
  position: absolute;
  z-index: 20;
}

.resize-e {
  right: -4px;
  top: 4px;
  bottom: 4px;
  width: 8px;
  cursor: ew-resize;
}

.resize-w {
  left: -4px;
  top: 4px;
  bottom: 4px;
  width: 8px;
  cursor: ew-resize;
}

.resize-s {
  bottom: -4px;
  left: 4px;
  right: 4px;
  height: 8px;
  cursor: ns-resize;
}

.resize-se {
  right: -4px;
  bottom: -4px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}

/* Context menu */
.context-menu {
  position: fixed;
  z-index: 10000;
  background: var(--controls-bg);
  border: 1px solid var(--border-main);
  border-radius: 8px;
  padding: 4px;
  min-width: 180px;
  box-shadow: var(--shadow-menu);
}

.context-menu button {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 6px 12px;
  font-size: 0.82em;
  cursor: pointer;
  border-radius: 4px;
}

.context-menu button:hover {
  background: var(--bg-surface-hover);
}

.context-menu button.danger {
  color: var(--danger);
}

.context-separator {
  height: 1px;
  background: var(--border-main);
  margin: 4px 8px;
}

.context-colors {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  flex-wrap: wrap;
}

.color-swatch {
  width: 20px !important;
  height: 20px !important;
  min-width: 20px;
  border-radius: 50% !important;
  padding: 0 !important;
  border: 2px solid transparent !important;
  cursor: pointer;
}

.color-swatch.active {
  border-color: white !important;
}

.color-swatch:hover {
  transform: scale(1.2);
}
</style>
