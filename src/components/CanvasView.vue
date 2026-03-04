<template>
  <div
    ref="containerRef"
    class="canvas-container"
    :class="{ 'is-panning': canvas.isPanning.value || spaceHeld, 'is-linking': appStore.linkingSourceId.value }"
    tabindex="0"
    @wheel.prevent="canvas.handleWheel"
    @pointerdown="onCanvasPointerDown"
    @pointermove="canvas.handlePointerMove"
    @pointerup="canvas.handlePointerUp"
    @dblclick="onDoubleClick"
    @keydown="onKeyDown"
    @keyup="onKeyUp"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onFileDrop"
    @contextmenu.prevent="onCanvasContextMenu"
  >
    <!-- Dot grid background -->
    <div class="canvas-grid" :style="gridStyle" />

    <!-- Zoom controls -->
    <div class="canvas-controls">
      <div
        class="save-indicator"
        :class="{ pending: appStore.hasPendingSaves.value }"
        :title="appStore.hasPendingSaves.value ? 'Saving…' : 'All changes saved'"
      />
      <div class="controls-separator" />
      <button
        class="scroll-mode-btn"
        :class="{ active: scrollMode === 'mouse' }"
        @click="toggleScrollMode"
        :title="scrollMode === 'mouse' ? 'Mouse mode: scroll = zoom (click for touchpad)' : 'Touchpad mode: scroll = pan (click for mouse)'"
      >
        <svg v-if="scrollMode === 'mouse'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="2" width="12" height="20" rx="6" />
          <line x1="12" y1="6" x2="12" y2="10" />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="3" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      </button>
      <div class="controls-separator" />
      <button @click="canvas.zoomIn()" title="Zoom in">+</button>
      <span class="zoom-level">{{ zoomPercent }}%</span>
      <button @click="canvas.zoomOut()" title="Zoom out">−</button>
      <button @click="canvas.resetZoom()" title="Reset zoom to 100%">1:1</button>
      <button @click="fitAllNotes" title="Fit all notes">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6" />
          <path d="M9 21H3v-6" />
          <path d="M21 3l-7 7" />
          <path d="M3 21l7-7" />
        </svg>
      </button>
      <button @click="centerOnSelection" title="Center on selection" :disabled="appStore.selectedNoteIds.size === 0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
    </div>

    <!-- Alignment controls (shown when 2+ notes selected) -->
    <div class="align-controls" v-if="multiSelected">
      <span class="align-label">Align</span>
      <button @click="alignNotes('left')" title="Align left edges">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="2" height="18"/><rect x="7" y="5" width="14" height="4" rx="1"/><rect x="7" y="13" width="10" height="4" rx="1"/></svg>
      </button>
      <button @click="alignNotes('center-h')" title="Align centers horizontally">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="11" y="2" width="2" height="20"/><rect x="4" y="5" width="16" height="4" rx="1"/><rect x="6" y="13" width="12" height="4" rx="1"/></svg>
      </button>
      <button @click="alignNotes('right')" title="Align right edges">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="19" y="3" width="2" height="18"/><rect x="3" y="5" width="14" height="4" rx="1"/><rect x="7" y="13" width="10" height="4" rx="1"/></svg>
      </button>
      <button @click="alignNotes('top')" title="Align top edges">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="2"/><rect x="5" y="7" width="4" height="14" rx="1"/><rect x="13" y="7" width="4" height="10" rx="1"/></svg>
      </button>
      <button @click="alignNotes('center-v')" title="Align centers vertically">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="11" width="20" height="2"/><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="13" y="6" width="4" height="12" rx="1"/></svg>
      </button>
      <button @click="alignNotes('bottom')" title="Align bottom edges">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="19" width="18" height="2"/><rect x="5" y="5" width="4" height="14" rx="1"/><rect x="13" y="9" width="4" height="10" rx="1"/></svg>
      </button>
      <div class="controls-separator" />
      <span class="align-label">Space</span>
      <button @click="distributeNotes('horizontal')" title="Distribute evenly horizontally">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="3" width="2" height="18"/><rect x="20" y="3" width="2" height="18"/><rect x="6" y="8" width="4" height="8" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/></svg>
      </button>
      <button @click="distributeNotes('vertical')" title="Distribute evenly vertically">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="2" width="18" height="2"/><rect x="3" y="20" width="18" height="2"/><rect x="8" y="6" width="8" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/></svg>
      </button>
    </div>

    <!-- Box selection rectangle -->
    <div
      v-if="boxSelection.active.value && boxSelection.displayRect.value"
      class="selection-box"
      :style="{
        left: `${boxSelection.displayRect.value.left}px`,
        top: `${boxSelection.displayRect.value.top}px`,
        width: `${boxSelection.displayRect.value.width}px`,
        height: `${boxSelection.displayRect.value.height}px`,
      }"
    />

    <!-- Transformed world -->
    <div
      class="canvas-world"
      :style="{ transform: canvas.transformCSS.value }"
    >
      <NoteComponent
        v-for="note in rootNotes"
        :key="note.id"
        :note="note"
        :depth="0"
        :spatial="true"
      />
    </div>

    <!-- Arrow SVG overlay (same transform) -->
    <ArrowLayer
      :transform="canvas.transform"
      :transformCSS="canvas.transformCSS.value"
    />


    <!-- Linking mode banner -->
    <div v-if="appStore.linkingSourceId.value" class="linking-mode-banner">
      <span>Click a note to link</span>
      <button @click="appStore.cancelLinking()">Cancel</button>
    </div>

    <!-- File drop zone overlay -->
    <div v-if="fileDropActive && !fileReplaceTargetId" class="file-drop-overlay">
      <div class="file-drop-message">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <polyline points="9 15 12 12 15 15" />
        </svg>
        <span>Drop files to create notes</span>
      </div>
    </div>

    <!-- Toast notification -->
    <Transition name="toast-fade">
      <div v-if="toastMessage" class="canvas-toast">{{ toastMessage }}</div>
    </Transition>

    <!-- Canvas context menu -->
    <Teleport to="body">
      <div
        v-if="canvasMenuVisible"
        ref="canvasMenuRef"
        class="context-menu"
        :style="{ left: `${canvasMenuPos.x}px`, top: `${canvasMenuPos.y}px` }"
        @pointerdown.stop
      >
        <button @click="canvasMenuCreateNote">New note</button>
        <div class="context-separator" />
        <button @click="canvasMenuGenerateWeek">Insert week view…</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useCanvas } from '../composables/useCanvas'
import { useDrag } from '../composables/useDrag'
import { useResize } from '../composables/useResize'
import { useBoxSelection } from '../composables/useBoxSelection'
import type { Note } from '../types/note'
import type { ResizeHandle } from '../composables/useResize'
import { appStore } from '../stores/app'
import { history } from '../stores/history'
import { appendAutoSection, replaceAutoSection, noteHasAutoBody } from '../utils/autoSections'
import { getStorage, loadedPages, getRootNotesForPage, clearArrowRecompute } from '../stores/state'
import { panes, setActivePane } from '../stores/panes'
import { settings } from '../stores/settings'
import { loadUserTheme } from '../utils/themeLoader'
import NoteComponent from './NoteComponent.vue'
import ArrowLayer from './ArrowLayer.vue'

const props = defineProps<{
  paneId: string
}>()

const emit = defineEmits<{
  (e: 'activate'): void
}>()

// Pane-specific computed
const paneContext = computed(() => panes.get(props.paneId))
const panePageId = computed(() => paneContext.value?.pageId ?? null)
const panePage = computed(() => {
  const id = panePageId.value
  return id ? loadedPages.get(id) ?? null : null
})

const containerRef = ref<HTMLElement | null>(null)
const spaceHeld = ref(false)
const fileDropActive = ref(false)
const fileReplaceTargetId = ref<string | null>(null)

// Canvas context menu
const canvasMenuVisible = ref(false)
const canvasMenuPos = ref({ x: 0, y: 0 })
const canvasMenuRef = ref<HTMLElement | null>(null)

import { toastMessage, showToast } from '../stores/toast'
const canvasMenuWorldPos = ref({ x: 0, y: 0 })
let lastDragClientX = 0
let lastDragClientY = 0
const containerWidth = ref(800)
const containerHeight = ref(600)

const scrollMode = computed(() => settings.scrollMode)

function toggleScrollMode() {
  settings.scrollMode = settings.scrollMode === 'mouse' ? 'touchpad' : 'mouse'
}

const multiSelected = computed(() => appStore.selectedNoteIds.size >= 2)

function getSelectedNoteRects() {
  const results: { note: Note; el: HTMLElement; w: number; h: number }[] = []
  for (const id of appStore.selectedNoteIds) {
    const note = appStore.notes.get(id)
    if (!note) continue
    const el = document.getElementById(`note-${id}`) as HTMLElement | null
    if (!el) continue
    const w = el.offsetWidth
    const h = el.offsetHeight
    results.push({ note, el, w, h })
  }
  return results
}

/** Toggle collapse on all selected notes (Tab shortcut).
 *  Uses same cycle as master toggle: mixed → all folded → all unfolded. */
function toggleCollapseSelected() {
  const selectedIds = Array.from(appStore.selectedNoteIds)
  const selectedNotes = selectedIds
    .map(id => appStore.notes.get(id))
    .filter((n): n is Note => n !== undefined)
  if (selectedNotes.length === 0) return

  // Check aggregate state: are all fully collapsed?
  const allCollapsed = selectedNotes.every(n => n.collapsed)

  for (const note of selectedNotes) {
    if (!note.foldState) {
      note.foldState = { autoBody: false, body: false, container: false, links: false }
    }
    const before = history.snapshotNote(appStore.notes, note.id)!

    // Determine which sections are present on this note
    const present: ('autoBody' | 'body' | 'container' | 'links')[] = []
    if (noteHasAutoBody(note)) present.push('autoBody')
    if (note.body.enabled) present.push('body')
    if (note.container.enabled && note.container.childIds.length > 0) present.push('container')
    if (appStore.getLinksForNote(note.id).length > 0) present.push('links')

    if (present.length === 0) {
      note.collapsed = !allCollapsed ? true : false
    } else if (allCollapsed) {
      // All collapsed → unfold all
      for (const s of present) note.foldState[s] = false
      note.collapsed = false
    } else {
      // Mixed or all unfolded → fold all
      for (const s of present) note.foldState[s] = true
      note.collapsed = true
    }

    appStore.updateNote(note)
    appStore.pushNotePropertyAction(note.id, before, 'Toggle collapse')
  }
}

function centerOnSelection() {
  const items = getSelectedNoteRects()
  if (items.length === 0) return

  // Compute bounding box of selected notes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { note, w, h } of items) {
    minX = Math.min(minX, note.pos.x)
    minY = Math.min(minY, note.pos.y)
    maxX = Math.max(maxX, note.pos.x + w)
    maxY = Math.max(maxY, note.pos.y + h)
  }

  const bw = maxX - minX
  const bh = maxY - minY
  const cx = minX + bw / 2
  const cy = minY + bh / 2

  const vw = containerWidth.value
  const vh = containerHeight.value

  // Padding around the content (px in screen space)
  const pad = 60

  // Zoom to fit, but never exceed 100%
  const fitScale = Math.min(
    (vw - pad * 2) / bw,
    (vh - pad * 2) / bh,
    1 // cap at 100%
  )
  const scale = Math.max(0.1, fitScale)

  canvas.transform.scale = scale
  canvas.transform.x = vw / 2 - cx * scale
  canvas.transform.y = vh / 2 - cy * scale
}

function fitAllNotes() {
  const positions: Array<{ x: number; y: number; w: number; h: number }> = []
  if (!panePage.value) return

  for (const id of panePage.value.rootNoteIds) {
    const note = appStore.notes.get(id)
    if (!note) continue
    const el = document.getElementById(`note-${id}`) as HTMLElement | null
    const w = el?.offsetWidth ?? 200
    const h = el?.offsetHeight ?? 60
    positions.push({ x: note.pos.x, y: note.pos.y, w, h })
  }

  canvas.fitAll(positions)
}

function alignNotes(mode: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v') {
  const items = getSelectedNoteRects()
  if (items.length < 2) return

  // Snapshot before
  const noteIds = items.map(i => i.note.id)
  const notesBefore = history.snapshotNotes(appStore.notes, noteIds)

  let target: number
  switch (mode) {
    case 'left':
      target = Math.min(...items.map(i => i.note.pos.x))
      items.forEach(i => { i.note.pos.x = target })
      break
    case 'right':
      target = Math.max(...items.map(i => i.note.pos.x + i.w))
      items.forEach(i => { i.note.pos.x = target - i.w })
      break
    case 'top':
      target = Math.min(...items.map(i => i.note.pos.y))
      items.forEach(i => { i.note.pos.y = target })
      break
    case 'bottom':
      target = Math.max(...items.map(i => i.note.pos.y + i.h))
      items.forEach(i => { i.note.pos.y = target - i.h })
      break
    case 'center-h':
      target = items.reduce((s, i) => s + i.note.pos.x + i.w / 2, 0) / items.length
      items.forEach(i => { i.note.pos.x = target - i.w / 2 })
      break
    case 'center-v':
      target = items.reduce((s, i) => s + i.note.pos.y + i.h / 2, 0) / items.length
      items.forEach(i => { i.note.pos.y = target - i.h / 2 })
      break
  }

  items.forEach(i => appStore.updateNote(i.note))

  // Snapshot after and push undo
  const notesAfter = history.snapshotNotes(appStore.notes, noteIds)
  const optimized = history.optimizeSnapshots(notesBefore, notesAfter)
  history.pushAction({
    description: `Align notes (${mode})`,
    pageId: panePageId.value ?? '',
    notesBefore: optimized.notesBefore,
    notesAfter: optimized.notesAfter,
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: noteIds,
    selectionAfter: noteIds,
  })

  appStore.triggerArrowRecompute()
}

function distributeNotes(axis: 'horizontal' | 'vertical') {
  const items = getSelectedNoteRects()
  if (items.length < 3) return

  // Snapshot before
  const noteIds = items.map(i => i.note.id)
  const notesBefore = history.snapshotNotes(appStore.notes, noteIds)

  if (axis === 'horizontal') {
    items.sort((a, b) => a.note.pos.x - b.note.pos.x)
    const first = items[0].note.pos.x
    const last = items[items.length - 1].note.pos.x + items[items.length - 1].w
    const totalItemWidth = items.reduce((s, i) => s + i.w, 0)
    const gap = (last - first - totalItemWidth) / (items.length - 1)
    let x = first
    items.forEach(i => {
      i.note.pos.x = x
      x += i.w + gap
    })
  } else {
    items.sort((a, b) => a.note.pos.y - b.note.pos.y)
    const first = items[0].note.pos.y
    const last = items[items.length - 1].note.pos.y + items[items.length - 1].h
    const totalItemHeight = items.reduce((s, i) => s + i.h, 0)
    const gap = (last - first - totalItemHeight) / (items.length - 1)
    let y = first
    items.forEach(i => {
      i.note.pos.y = y
      y += i.h + gap
    })
  }

  items.forEach(i => appStore.updateNote(i.note))

  // Snapshot after and push undo
  const notesAfter = history.snapshotNotes(appStore.notes, noteIds)
  const optimized = history.optimizeSnapshots(notesBefore, notesAfter)
  history.pushAction({
    description: `Distribute notes (${axis})`,
    pageId: panePageId.value ?? '',
    notesBefore: optimized.notesBefore,
    notesAfter: optimized.notesAfter,
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: noteIds,
    selectionAfter: noteIds,
  })

  appStore.triggerArrowRecompute()
}

const canvas = useCanvas(containerRef)
const drag = useDrag(() => canvas.transform)
const resize = useResize(() => canvas.transform)
const boxSelection = useBoxSelection()

// Provide drag/resize and drag state to child notes
provide('paneId', props.paneId)
provide('panePage', panePage)
provide('activatePane', activatePane)
provide('startDrag', drag.startDrag)
provide('startResize', resize.startResize)
provide('isDragging', drag.isDragging)
provide('dragTargetId', drag.dragTargetId)
provide('dropTargetId', drag.dropTargetId)

const rootNotes = computed(() => {
  const pid = panePageId.value
  if (!pid) return []
  return getRootNotesForPage(pid)
})
const zoomPercent = computed(() => Math.round(canvas.transform.scale * 100))

function activatePane() {
  setActivePane(props.paneId)
  emit('activate')
}

const gridStyle = computed(() => {
  const s = canvas.transform.scale
  const spacing = 30 * s
  const ox = canvas.transform.x % spacing
  const oy = canvas.transform.y % spacing
  const dotSize = Math.max(1, 1.5 * s)

  return {
    backgroundImage: `radial-gradient(circle, var(--canvas-dot) ${dotSize}px, transparent ${dotSize}px)`,
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${ox}px ${oy}px`,
  }
})

function isCanvasBackground(target: HTMLElement): boolean {
  return (
    target.classList.contains('canvas-world') ||
    target.classList.contains('canvas-container') ||
    target.classList.contains('canvas-grid')
  )
}

function onCanvasPointerDown(e: PointerEvent) {
  activatePane()
  // Kill any stuck drag/resize from a lost pointerup (e.g. compositor window move)
  if (drag.isDragging.value) {
    drag.cancelDrag()
  }
  if (resize.isResizing.value) {
    resize.cancelResize()
  }

  // Focus the canvas for keyboard events
  containerRef.value?.focus()

  const target = e.target as HTMLElement

  // Middle mouse always pans
  if (e.button === 1) {
    canvas.handlePointerDown(e)
    return
  }

  if (e.button !== 0) return

  if (isCanvasBackground(target)) {
    appStore.clearEditing()

    // Cancel linking mode on background click
    if (appStore.linkingSourceId.value) {
      appStore.cancelLinking()
      return
    }

    // Space+left-click = pan
    if (spaceHeld.value) {
      canvas.isPanning.value = true
      const panStartX = e.clientX - canvas.transform.x
      const panStartY = e.clientY - canvas.transform.y

      const onMove = (ev: PointerEvent) => {
        canvas.transform.x = ev.clientX - panStartX
        canvas.transform.y = ev.clientY - panStartY
      }
      const onUp = () => {
        canvas.isPanning.value = false
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }

    // Left-click on background = box selection
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      appStore.clearSelection()
    }
    boxSelection.start(e)
  }
}

function onDoubleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (isCanvasBackground(target)) {
    const worldPos = canvas.clientToWorld(e.clientX, e.clientY)
    appStore.createNote(worldPos)
  }
}

// ── Canvas context menu ──

let canvasMenuCleanup: (() => void) | null = null

function closeCanvasMenu() {
  canvasMenuVisible.value = false
  if (canvasMenuCleanup) { canvasMenuCleanup(); canvasMenuCleanup = null }
}

function onCanvasContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!isCanvasBackground(target)) return

  canvasMenuPos.value = { x: e.clientX, y: e.clientY }
  canvasMenuWorldPos.value = canvas.clientToWorld(e.clientX, e.clientY)
  canvasMenuVisible.value = true

  nextTick(() => {
    const el = canvasMenuRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    let { x, y } = canvasMenuPos.value
    if (rect.right > window.innerWidth - pad) x = window.innerWidth - rect.width - pad
    if (rect.bottom > window.innerHeight - pad) y = window.innerHeight - rect.height - pad
    if (x < pad) x = pad
    if (y < pad) y = pad
    canvasMenuPos.value = { x, y }
  })

  if (canvasMenuCleanup) canvasMenuCleanup()

  const close = (ev: Event) => {
    if (ev.type === 'pointerdown') {
      const menu = document.querySelector('.context-menu')
      if (menu && ev.target instanceof Node && menu.contains(ev.target)) return
    }
    closeCanvasMenu()
  }

  canvasMenuCleanup = () => {
    window.removeEventListener('pointerdown', close, true)
    window.removeEventListener('keydown', close)
  }

  setTimeout(() => {
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close)
  }, 0)
}

function canvasMenuCreateNote() {
  const pos = { ...canvasMenuWorldPos.value }
  closeCanvasMenu()
  appStore.createNote(pos)
}

async function canvasMenuGenerateWeek() {
  const pos = { ...canvasMenuWorldPos.value }
  closeCanvasMenu()

  // Prompt for date — default to current week
  const input = prompt('Week of (YYYY-MM-DD):', new Date().toISOString().slice(0, 10))
  if (input === null) return

  const date = new Date(input + 'T00:00:00')
  if (isNaN(date.getTime())) {
    alert('Invalid date format. Use YYYY-MM-DD.')
    return
  }

  await appStore.generateWeek(pos, date)
}

function onKeyDown(e: KeyboardEvent) {
  // Don't intercept keys when typing in an editor (contenteditable)
  const target = e.target as HTMLElement
  if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    return
  }

  if (e.key === ' ' && !appStore.editingNoteId.value) {
    e.preventDefault()
    spaceHeld.value = true
    return
  }

  // Tab: toggle collapse/expand all selected notes
  if (e.key === 'Tab' && !appStore.editingNoteId.value) {
    e.preventDefault()
    if (appStore.selectedNoteIds.size > 0) {
      toggleCollapseSelected()
    }
    return
  }

  const isCtrl = e.ctrlKey || e.metaKey

  // Undo/redo
  if (isCtrl && e.key === 'z' && !e.shiftKey && !appStore.editingNoteId.value) {
    e.preventDefault()
    appStore.undo()
    return
  }
  if (isCtrl && (e.key === 'Z' || (e.key === 'z' && e.shiftKey)) && !appStore.editingNoteId.value) {
    e.preventDefault()
    appStore.redo()
    return
  }
  if (isCtrl && e.key === 'y' && !appStore.editingNoteId.value) {
    e.preventDefault()
    appStore.redo()
    return
  }

  // Reload user theme CSS
  if (isCtrl && e.shiftKey && e.key === 'T') {
    e.preventDefault()
    loadUserTheme()
    return
  }

  // Copy
  if (isCtrl && e.key === 'c' && !appStore.editingNoteId.value) {
    e.preventDefault()
    appStore.copySelected()
    return
  }

  // Paste
  if (isCtrl && e.key === 'v' && !appStore.editingNoteId.value) {
    e.preventDefault()
    if (appStore.hasClipboard() && panePage.value) {
      // Paste at center of current viewport
      const vw = containerWidth.value
      const vh = containerHeight.value
      const centerWorld = {
        x: (-canvas.transform.x + vw / 2) / canvas.transform.scale,
        y: (-canvas.transform.y + vh / 2) / canvas.transform.scale,
      }
      appStore.pasteNotes(panePage.value!.id, centerWorld).catch(console.error)
    }
    return
  }

  // Duplicate
  if (isCtrl && e.key === 'd' && !appStore.editingNoteId.value) {
    e.preventDefault()
    if (appStore.selectedNoteIds.size > 0) {
      appStore.duplicateNotes(Array.from(appStore.selectedNoteIds)).catch(console.error)
    }
    return
  }

  // Export selected notes to clipboard as rich text
  if (isCtrl && e.key === 'e' && !e.shiftKey && !appStore.editingNoteId.value) {
    e.preventDefault()
    if (appStore.selectedNoteIds.size > 0) {
      exportSelectedNotes().catch(console.error)
    }
    return
  }

  // Export selected file notes to clipboard as spreadsheet table
  if (isCtrl && e.shiftKey && (e.key === 'e' || e.key === 'E') && !appStore.editingNoteId.value) {
    e.preventDefault()
    if (appStore.selectedNoteIds.size > 0) {
      exportFileTable().catch(console.error)
    }
    return
  }

  // Cancel linking mode
  if (e.key === 'Escape' && appStore.linkingSourceId.value) {
    e.preventDefault()
    appStore.cancelLinking()
    return
  }

  // Don't handle other keys when editing
  if (appStore.editingNoteId.value) {
    if (e.key === 'Escape') {
      e.preventDefault()
      appStore.clearEditing()
    }
    return
  }

  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      if (appStore.selectedNoteIds.size > 0 || appStore.selectedArrowIds.size > 0) {
        e.preventDefault()
        appStore.deleteAllSelected()
      }
      break

    case 'Escape':
      if (drag.isDragging.value) {
        drag.cancelDrag()
      }
      if (resize.isResizing.value) {
        resize.cancelResize()
      }
      appStore.clearSelection()
      appStore.clearEditing()
      break

    case 'a':
      if (isCtrl) {
        e.preventDefault()
        if (panePage.value) {
          for (const id of panePage.value.rootNoteIds) {
            appStore.selectedNoteIds.add(id)
          }
        }
      }
      break

    case 'z':
      if (!isCtrl) {
        e.preventDefault()
        centerOnSelection()
      }
      break

    case 'Z':
      if (!isCtrl) {
        e.preventDefault()
        fitAllNotes()
      }
      break

    case 'l':
      if (!isCtrl && appStore.selectedNoteIds.size === 1) {
        e.preventDefault()
        const noteId = Array.from(appStore.selectedNoteIds)[0]
        appStore.startLinking(noteId)
      }
      break
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key === ' ') {
    spaceHeld.value = false
  }
}

// ── File drop ──

let dragLeaveTimer: ReturnType<typeof setTimeout> | null = null

function onDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('Files')) return
  e.dataTransfer.dropEffect = 'copy'
  fileDropActive.value = true
  lastDragClientX = e.clientX
  lastDragClientY = e.clientY
  if (dragLeaveTimer) { clearTimeout(dragLeaveTimer); dragLeaveTimer = null }
}

function onDragLeave(e: DragEvent) {
  dragLeaveTimer = setTimeout(() => { fileDropActive.value = false }, 100)
}

async function onFileDrop(_e: DragEvent) {
  fileDropActive.value = false
  // File drops are handled by the Tauri event listener
}

const FILE_EMOJI_MAP: Record<string, string> = {
  // Video
  mp4: '🎞️', mkv: '🎞️', mov: '🎞️', avi: '🎞️', wmv: '🎞️', webm: '🎞️',
  mxf: '🎞️', ts: '🎞️', m2ts: '🎞️', mts: '🎞️', mpg: '🎞️', mpeg: '🎞️',
  m4v: '🎞️', flv: '🎞️', ogv: '🎞️', vob: '🎞️', r3d: '🎞️', braw: '🎞️',
  // Audio
  mp3: '🔊', wav: '🔊', flac: '🔊', aac: '🔊', ogg: '🔊', wma: '🔊',
  aiff: '🔊', aif: '🔊', m4a: '🔊', opus: '🔊', alac: '🔊',
  // Image
  png: '📷', jpg: '📷', jpeg: '📷', gif: '📷', webp: '📷', bmp: '📷',
  tiff: '📷', tif: '📷', svg: '📷', ico: '📷', heic: '📷', heif: '📷',
  exr: '📷', dpx: '📷', raw: '📷', cr2: '📷', nef: '📷', arw: '📷',
  dng: '📷', psd: '📷',
  // Text / docs
  txt: '📝', md: '📝', rtf: '📝', csv: '📝', tsv: '📝', log: '📝',
  pdf: '📄', doc: '📄', docx: '📄', odt: '📄', pages: '📄',
  xls: '📊', xlsx: '📊', ods: '📊',
  ppt: '📊', pptx: '📊', odp: '📊', key: '📊',
  // Code
  js: '💻', py: '💻', rs: '💻', c: '💻', cpp: '💻', h: '💻',
  java: '💻', go: '💻', rb: '💻', sh: '💻', html: '💻', css: '💻',
  json: '💻', xml: '💻', yaml: '💻', yml: '💻', toml: '💻', nix: '💻',
  // Archive
  zip: '📦', tar: '📦', gz: '📦', bz2: '📦', xz: '📦', '7z': '📦',
  rar: '📦', zst: '📦',
}

function fileEmoji(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return '📎'
  const ext = filename.slice(dot + 1).toLowerCase()
  return FILE_EMOJI_MAP[ext] || '📎'
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

/**
 * Hit-test the drop position against existing file-linked notes.
 * Returns the Note if found, null otherwise.
 */
function findFileNoteAtPoint(clientX: number, clientY: number) {
  const elements = document.elementsFromPoint(clientX, clientY)
  for (const el of elements) {
    const noteEl = el.closest('[id^="note-"]') as HTMLElement | null
    if (!noteEl) continue
    const noteId = noteEl.id.replace('note-', '')
    const note = appStore.notes.get(noteId)
    if (note?.link && !note.link.startsWith('page:')) {
      return note
    }
  }
  return null
}

/**
 * Replace an existing file note's link with a new file.
 * Shows confirmation dialog, preserves body/links/arrows, appends previous file info.
 */
async function handleFileReplacement(note: any, newName: string, newPath: string) {
  try {
    const { ask } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')

    // Get old filename from path
    const oldPath = note.link || ''
    const oldParts = oldPath.replace(/\\/g, '/').split('/')
    const oldName = oldParts[oldParts.length - 1] || oldPath

    // Get file sizes
    const oldSize = note.fileSize ? ` (${formatFileSize(note.fileSize)})` : ''
    let newSize = ''
    let newBytes: number | undefined
    try {
      newBytes = await invoke<number>('get_file_size', { path: newPath })
      newSize = ` (${formatFileSize(newBytes)})`
    } catch {}

    const confirmed = await ask(
      `Update file reference?\n\n"${oldName}"${oldSize}\n→ "${newName}"${newSize}`,
      { title: 'Replace file', kind: 'info', okLabel: 'Replace', cancelLabel: 'Cancel' }
    )
    if (!confirmed) return

    const before = history.snapshotNote(appStore.notes, note.id)!

    // Head: just the new filename
    const displayName = `${fileEmoji(newName)} ${newName}`
    note.head.content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: displayName }] },
      ],
    }

    // Replace Path section with new path
    replaceAutoSection(note, 'Path', [
      { type: 'paragraph', content: [{ type: 'text', text: newPath }] },
    ])

    // Append old file to history
    const now = new Date()
    const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
    appendAutoSection(note, 'File History', [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `${timestamp} — ${oldName}`, marks: [{ type: 'italic' }] }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: oldPath }],
      },
    ])

    // Update note
    note.link = newPath
    note.fileSize = newBytes

    appStore.updateNote(note)
    appStore.pushNotePropertyAction(note.id, before, 'Replace file')
  } catch (e) {
    console.error('File replacement failed:', e)
  }
}

// ── Export selected notes to HTML ──

/** Escape HTML entities */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Convert Tiptap inline content (marks + text) to HTML */
function inlineToHtml(nodes: any[]): string {
  if (!nodes) return ''
  let out = ''
  for (const node of nodes) {
    if (node.type === 'text') {
      let html = esc(node.text || '')
      const marks = node.marks || []
      for (const mark of marks) {
        switch (mark.type) {
          case 'bold': html = `<strong>${html}</strong>`; break
          case 'italic': html = `<em>${html}</em>`; break
          case 'strike': html = `<s>${html}</s>`; break
          case 'code': html = `<code>${html}</code>`; break
          case 'underline': html = `<u>${html}</u>`; break
          case 'link': {
            const href = esc(mark.attrs?.href || '')
            html = `<a href="${href}">${html}</a>`
            break
          }
        }
      }
      out += html
    } else if (node.type === 'hardBreak') {
      out += '<br>'
    }
  }
  return out
}

/** Convert a Tiptap JSON doc to HTML. Collects image filenames for asset copying. */
function tiptapToHtml(doc: any, images: Set<string>): string {
  if (!doc?.content) return ''
  const parts: string[] = []

  for (const node of doc.content) {
    switch (node.type) {
      case 'paragraph':
        parts.push(`<p>${inlineToHtml(node.content)}</p>`)
        break

      case 'heading': {
        const level = Math.min(node.attrs?.level || 1, 6)
        parts.push(`<h${level}>${inlineToHtml(node.content)}</h${level}>`)
        break
      }

      case 'bulletList':
        if (node.content) {
          parts.push('<ul>')
          for (const li of node.content) {
            if (li.type === 'listItem' && li.content) {
              parts.push(`<li>${li.content.map((c: any) => {
                if (c.type === 'paragraph') return inlineToHtml(c.content)
                return tiptapToHtml({ content: [c] }, images)
              }).join('')}</li>`)
            }
          }
          parts.push('</ul>')
        }
        break

      case 'orderedList':
        if (node.content) {
          parts.push('<ol>')
          for (const li of node.content) {
            if (li.type === 'listItem' && li.content) {
              parts.push(`<li>${li.content.map((c: any) => {
                if (c.type === 'paragraph') return inlineToHtml(c.content)
                return tiptapToHtml({ content: [c] }, images)
              }).join('')}</li>`)
            }
          }
          parts.push('</ol>')
        }
        break

      case 'taskList':
        if (node.content) {
          parts.push('<ul class="task-list">')
          for (const ti of node.content) {
            if (ti.type === 'taskItem') {
              const checked = ti.attrs?.checked ? ' checked' : ''
              const firstP = ti.content?.[0]
              parts.push(`<li><input type="checkbox" disabled${checked}> ${inlineToHtml(firstP?.content)}</li>`)
            }
          }
          parts.push('</ul>')
        }
        break

      case 'blockquote':
        if (node.content) {
          parts.push(`<blockquote>${tiptapToHtml({ content: node.content }, images)}</blockquote>`)
        }
        break

      case 'codeBlock': {
        const lang = node.attrs?.language ? ` class="language-${esc(node.attrs.language)}"` : ''
        const codeText = node.content?.map((n: any) => n.text || '').join('') || ''
        parts.push(`<pre><code${lang}>${esc(codeText)}</code></pre>`)
        break
      }

      case 'horizontalRule':
        parts.push('<hr>')
        break

      case 'image': {
        const src = node.attrs?.src || ''
        if (src && !src.startsWith('data:') && !src.startsWith('http')) {
          images.add(src)
          parts.push(`<img src="export_assets/${esc(src)}">`)
        } else if (src.startsWith('http')) {
          parts.push(`<img src="${esc(src)}">`)
        }
        break
      }

      case 'table':
        if (node.content) {
          parts.push('<table>')
          for (let ri = 0; ri < node.content.length; ri++) {
            const row = node.content[ri]
            if (row.type !== 'tableRow') continue
            const tag = ri === 0 ? 'th' : 'td'
            const cells = (row.content || []).map((c: any) => {
              const cellContent = c.content?.[0]
              return `<${tag}>${inlineToHtml(cellContent?.content)}</${tag}>`
            })
            parts.push(`<tr>${cells.join('')}</tr>`)
          }
          parts.push('</table>')
        }
        break
    }
  }

  return parts.join('\n')
}

/** Convert a note (and its children recursively) to HTML */
function noteToHtml(noteId: string, headingLevel: number, images: Set<string>): string {
  const note = appStore.notes.get(noteId)
  if (!note) return ''

  const parts: string[] = []
  const hLevel = Math.min(headingLevel, 6)

  // Head → heading
  if (note.head.enabled && note.head.content) {
    const headHtml = tiptapToHtml(note.head.content, images)
    // Extract text from paragraphs to use as heading
    const doc = note.head.content
    if (doc?.content) {
      const firstP = doc.content[0]
      if (firstP) {
        parts.push(`<h${hLevel}>${inlineToHtml(firstP.content)}</h${hLevel}>`)
        // Additional head paragraphs as regular text
        for (let i = 1; i < doc.content.length; i++) {
          parts.push(tiptapToHtml({ content: [doc.content[i]] }, images))
        }
      }
    }
  }

  // AutoBody (Data: file path, analysis, file history)
  if (noteHasAutoBody(note) && note.autoBody.content) {
    parts.push(tiptapToHtml(note.autoBody.content, images))
  }

  // Body
  if (note.body.enabled && note.body.content) {
    parts.push(tiptapToHtml(note.body.content, images))
  }

  // Container children (recurse)
  if (note.container.enabled && note.container.childIds.length > 0) {
    for (const childId of note.container.childIds) {
      parts.push(noteToHtml(childId, headingLevel + 1, images))
    }
  }

  return parts.join('\n')
}

const EXPORT_CSS = `
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  max-width: 800px;
  margin: 40px auto;
  padding: 0 20px;
  line-height: 1.6;
}
h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
h1 { border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
img { max-width: 100%; height: auto; margin: 8px 0; }
table { border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 6px 12px; text-align: left; }
th { background: #f5f5f5; }
blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: 0.5em 1em; }
pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
pre code { background: none; padding: 0; }
hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
ul.task-list { list-style: none; padding-left: 0; }
ul.task-list li { padding: 2px 0; }
`.trim()

async function exportSelectedNotes() {
  const selectedIds = Array.from(appStore.selectedNoteIds)
  if (selectedIds.length === 0) return

  // Sort spatially: top-to-bottom, left-to-right
  const notes = selectedIds
    .map(id => appStore.notes.get(id))
    .filter(Boolean) as any[]
  notes.sort((a, b) => {
    const rowDiff = a.pos.y - b.pos.y
    if (Math.abs(rowDiff) > 50) return rowDiff
    return a.pos.x - b.pos.x
  })

  // Convert to HTML
  const images = new Set<string>()
  const bodyParts: string[] = []
  for (let i = 0; i < notes.length; i++) {
    if (i > 0) bodyParts.push('<hr>')
    bodyParts.push(noteToHtml(notes[i].id, 2, images))
  }

  let htmlBody = bodyParts.join('\n')

  // Embed images as data URIs for clipboard compatibility
  if (images.size > 0) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const storage = getStorage()
      const vaultPath = storage.getVaultPath()

      for (const filename of images) {
        try {
          const base64 = await invoke<string>('read_asset', { vaultPath, filename })
          const ext = filename.split('.').pop()?.toLowerCase() || 'png'
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
            : ext === 'gif' ? 'image/gif'
            : ext === 'webp' ? 'image/webp'
            : 'image/png'
          htmlBody = htmlBody.replaceAll(
            `src="export_assets/${esc(filename)}"`,
            `src="data:${mime};base64,${base64}"`
          )
        } catch (e) {
          console.warn(`[export] Failed to read asset ${filename}:`, e)
        }
      }
    } catch (e) {
      console.warn('[export] Failed to embed images:', e)
    }
  }

  const html = `<html><head><style>${EXPORT_CSS}</style></head><body>${htmlBody}</body></html>`

  // Copy to clipboard as rich text
  try {
    const blob = new Blob([html], { type: 'text/html' })
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': new Blob([htmlBody.replace(/<[^>]*>/g, '')], { type: 'text/plain' }),
      })
    ])
    console.log('[export] Copied to clipboard')
    showToast('Copied to clipboard')
  } catch (e) {
    console.error('Clipboard write failed:', e)
  }
}

/**
 * Export selected file notes as a tab-separated table to clipboard.
 * Pasteable into Google Sheets, Excel, etc.
 */
async function exportFileTable() {
  const selectedIds = Array.from(appStore.selectedNoteIds)
  if (selectedIds.length === 0) return

  // Filter to file notes, sort spatially
  const fileNotes = selectedIds
    .map(id => appStore.notes.get(id))
    .filter(n => n && n.link && !n.link.startsWith('page:')) as any[]

  if (fileNotes.length === 0) return

  fileNotes.sort((a, b) => {
    const rowDiff = a.pos.y - b.pos.y
    if (Math.abs(rowDiff) > 50) return rowDiff
    return a.pos.x - b.pos.x
  })

  const rows = fileNotes.map(note => {
    const fullPath = note.link || ''
    const parts = fullPath.replace(/\\/g, '/').split('/')
    const filename = parts[parts.length - 1] || fullPath
    const dir = parts.slice(0, -1).join('/')
    return `${filename}\t${dir}`
  })

  const tsv = rows.join('\n')

  // Build HTML table for rich-text paste targets (email, docs)
  const htmlRows = rows.map(row => {
    const [name, dir] = row.split('\t')
    return `<tr><td style="border:1px solid #ddd;padding:4px 10px">${esc(name)}</td><td style="border:1px solid #ddd;padding:4px 10px">${esc(dir)}</td></tr>`
  })
  const htmlTable = `<table style="border-collapse:collapse">
${htmlRows.join('\n')}
</table>`

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([htmlTable], { type: 'text/html' }),
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
      })
    ])
    console.log(`[export] Copied ${fileNotes.length} file entries to clipboard`)
    showToast("Copied file table to clipboard")
  } catch (e) {
    console.error('Clipboard write failed:', e)
  }
}

async function createNotesFromDrop(
  clientX: number, clientY: number,
  names: string[], fullPaths: string[] | null,
  browserItems: DataTransferItem[]
) {
  const worldPos = canvas.clientToWorld(clientX, clientY)
  const NOTE_SPACING = 40
  const NOTE_WIDTH_ESTIMATE = 200
  const cols = Math.ceil(Math.sqrt(names.length))
  const createdNoteIds: string[] = []

  for (let i = 0; i < names.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const notePos = {
      x: worldPos.x + col * (NOTE_WIDTH_ESTIMATE + NOTE_SPACING),
      y: worldPos.y + row * (NOTE_SPACING + 50),
    }

    let isFolder = false
    if (browserItems[i]) {
      const entry = (browserItems[i] as any).webkitGetAsEntry?.()
      if (entry?.isDirectory) isFolder = true
    }
    if (!isFolder && fullPaths?.[i]) {
      // Check via Rust command
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        isFolder = await invoke<boolean>('is_directory', { path: fullPaths[i] })
      } catch {}
    }

    const displayName = isFolder ? `📁 ${names[i]}` : `${fileEmoji(names[i])} ${names[i]}`
    const filePath = fullPaths?.[i] || ''

    // Head: just the filename
    const headParagraphs: any[] = [
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: displayName }] },
    ]

    const note = await appStore.createNote(notePos, undefined, {
      headContent: { type: 'doc', content: headParagraphs },
      collapsed: false,
      link: filePath || undefined,
      nodeType: 'file',
      startEditing: false,
      enableBody: false,
    })

    // Get the reactive proxy from the Map (createNote returns the raw object,
    // which won't trigger Vue re-renders when mutated)
    const reactiveNote = appStore.notes.get(note.id) ?? note

    // Path goes into Data section (starts folded)
    if (filePath) {
      replaceAutoSection(reactiveNote, 'Path', [
        { type: 'paragraph', content: [{ type: 'text', text: filePath }] },
      ])
      reactiveNote.foldState.autoBody = true
    }

    // Store file size
    if (filePath && !isFolder) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        reactiveNote.fileSize = await invoke<number>('get_file_size', { path: filePath })
      } catch {}
    }

    appStore.updateNote(reactiveNote)
    createdNoteIds.push(note.id)
  }

  appStore.clearSelection()
  for (const id of createdNoteIds) {
    appStore.selectedNoteIds.add(id)
  }
}

let resizeObserver: ResizeObserver | null = null
let unlistenDragDrop: (() => void) | null = null

// ── Per-page viewport memory ──
const pageViewports = new Map<string, { x: number; y: number; scale: number }>()

function saveCurrentViewport() {
  const pageId = panePageId.value
  if (pageId) {
    pageViewports.set(pageId, {
      x: canvas.transform.x,
      y: canvas.transform.y,
      scale: canvas.transform.scale,
    })
  }
}

function restoreOrFitViewport() {
  const pageId = panePageId.value
  if (!pageId) return

  const saved = pageViewports.get(pageId)
  if (saved) {
    canvas.transform.x = saved.x
    canvas.transform.y = saved.y
    canvas.transform.scale = saved.scale
  } else {
    // First visit to this page — fit all notes
    fitAllNotes()
  }
}

// Save viewport before page switch, restore/fit after
watch(() => panePageId.value, (_newId, oldId) => {
  if (oldId) {
    pageViewports.set(oldId, {
      x: canvas.transform.x,
      y: canvas.transform.y,
      scale: canvas.transform.scale,
    })
  }
  nextTick(() => {
    requestAnimationFrame(() => {
      restoreOrFitViewport()
    })
  })
})

// Pan to a note when focusNoteId is set (e.g. clicking a link chip)
watch(() => appStore.focusNoteId.value, (noteId) => {
  if (!noteId) return
  appStore.focusNoteId.value = null

  nextTick(() => {
    const el = document.getElementById(`note-${noteId}`) as HTMLElement | null
    if (!el) return

    // Get the element's actual screen-space center (works for nested notes too)
    const rect = el.getBoundingClientRect()
    const screenCx = rect.left + rect.width / 2
    const screenCy = rect.top + rect.height / 2

    // Convert to world coordinates
    const world = canvas.clientToWorld(screenCx, screenCy)

    const vw = containerWidth.value
    const vh = containerHeight.value

    // Keep current scale, just pan to center the note
    canvas.transform.x = vw / 2 - world.x * canvas.transform.scale
    canvas.transform.y = vh / 2 - world.y * canvas.transform.scale
  })
})

onMounted(async () => {
  containerRef.value?.focus()

  // Fit all notes on initial launch
  nextTick(() => {
    requestAnimationFrame(() => {
      fitAllNotes()
    })
  })

  // Track container size for viewport calculations
  if (containerRef.value) {
    containerWidth.value = containerRef.value.clientWidth
    containerHeight.value = containerRef.value.clientHeight
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width
        containerHeight.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(containerRef.value)
  }

  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const webview = getCurrentWebviewWindow()
    unlistenDragDrop = await webview.onDragDropEvent((event) => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') {
        fileDropActive.value = true
        const cx = event.payload.position.x / window.devicePixelRatio
        const cy = event.payload.position.y / window.devicePixelRatio
        lastDragClientX = cx
        lastDragClientY = cy

        // Check if hovering over a file note for replacement
        const target = findFileNoteAtPoint(cx, cy)
        const newId = target?.id || null
        if (newId !== fileReplaceTargetId.value) {
          // Remove highlight from previous target
          if (fileReplaceTargetId.value) {
            document.getElementById(`note-${fileReplaceTargetId.value}`)?.classList.remove('file-replace-target')
          }
          fileReplaceTargetId.value = newId
          // Add highlight to new target
          if (newId) {
            document.getElementById(`note-${newId}`)?.classList.add('file-replace-target')
          }
        }
      } else if (event.payload.type === 'drop') {
        fileDropActive.value = false
        // Clear replace highlight
        if (fileReplaceTargetId.value) {
          document.getElementById(`note-${fileReplaceTargetId.value}`)?.classList.remove('file-replace-target')
          fileReplaceTargetId.value = null
        }
        const paths = event.payload.paths
        const dropX = event.payload.position.x / window.devicePixelRatio
        const dropY = event.payload.position.y / window.devicePixelRatio
        const names = paths.map(p => {
          const parts = p.replace(/\\/g, '/').split('/')
          return parts[parts.length - 1] || p
        })

        // Single file dropped on an existing file note → offer replacement
        if (paths.length === 1) {
          const targetNote = findFileNoteAtPoint(dropX, dropY)
          if (targetNote) {
            handleFileReplacement(targetNote, names[0], paths[0])
            return
          }
        }

        createNotesFromDrop(dropX, dropY, names, paths, [])
      } else if (event.payload.type === 'leave') {
        fileDropActive.value = false
        if (fileReplaceTargetId.value) {
          document.getElementById(`note-${fileReplaceTargetId.value}`)?.classList.remove('file-replace-target')
          fileReplaceTargetId.value = null
        }
      }
    })
  } catch (e) {
    console.warn('Tauri drag-drop listener unavailable:', e)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  unlistenDragDrop?.()
  closeCanvasMenu()
  clearArrowRecompute(props.paneId)
})
</script>

<style>
.canvas-container {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: clip;
  background: var(--bg-canvas);
  cursor: crosshair;
  outline: none;
  user-select: none;
}

.canvas-container.is-panning {
  cursor: grabbing;
}

.canvas-container.is-linking {
  cursor: pointer;
}

.canvas-container.is-linking .note-outer {
  cursor: pointer;
}

.canvas-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--controls-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-main);
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 0.85em;
  box-shadow: var(--shadow-menu);
  z-index: 99999;
  pointer-events: none;
}

.toast-fade-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.toast-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.linking-mode-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  background: color-mix(in srgb, var(--accent) 15%, var(--controls-bg));
  border: 1px solid var(--accent);
  border-radius: 8px;
  box-shadow: var(--shadow-dialog);
  font-size: 0.82em;
  color: var(--text-secondary);
  user-select: none;
  pointer-events: auto;
}

.linking-mode-banner button {
  background: none;
  border: 1px solid var(--border-main);
  color: var(--text-muted);
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.9em;
  cursor: pointer;
}

.linking-mode-banner button:hover {
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
}

.canvas-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.canvas-world {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  will-change: transform;
}

.canvas-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--controls-bg);
  border: 1px solid var(--border-main);
  border-radius: 8px;
  padding: 4px;
}

.canvas-controls button {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 1.1em;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.canvas-controls button:hover {
  background: var(--bg-surface-hover);
}

.canvas-controls button:disabled {
  opacity: 0.3;
  cursor: default;
}

.canvas-controls button:disabled:hover {
  background: none;
}

.zoom-level {
  font-size: 0.75em;
  color: var(--text-muted);
  min-width: 36px;
  text-align: center;
  user-select: none;
}

.controls-separator {
  width: 1px;
  height: 18px;
  background: var(--border-main);
  margin: 0 2px;
}

.save-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4caf50;
  transition: background 0.3s ease;
  flex-shrink: 0;
}

.save-indicator.pending {
  background: #ff9800;
}

.scroll-mode-btn {
  position: relative;
}

.scroll-mode-btn.active {
  color: var(--accent-text) !important;
  background: var(--accent-bg);
}

/* Alignment toolbar */
.align-controls {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--controls-bg);
  border: 1px solid var(--border-main);
  border-radius: 8px;
  padding: 4px 6px;
}

.align-controls button {
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.align-controls button:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.align-label {
  font-size: 0.65em;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 4px;
  user-select: none;
}

/* Box selection rectangle */
.selection-box {
  position: fixed;
  border: 1.5px solid var(--accent);
  background: var(--accent-bg);
  pointer-events: none;
  z-index: 50;
  border-radius: 2px;
}

/* File drop overlay */
.file-drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(33, 150, 243, 0.08);
  border: 2px dashed var(--accent);
  border-radius: 8px;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.file-drop-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--accent-text);
  font-size: 0.9em;
  font-weight: 500;
  padding: 24px 32px;
  background: rgba(26, 26, 26, 0.9);
  border-radius: 12px;
  border: 1px solid var(--accent);
}

.note-outer.file-replace-target {
  outline: 2px solid var(--accent) !important;
  outline-offset: 2px;
  box-shadow: 0 0 16px rgba(33, 150, 243, 0.4) !important;
}
</style>
