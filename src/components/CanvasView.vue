<template>
  <div
    ref="containerRef"
    class="canvas-container"
    :class="{ 'is-panning': canvas.isPanning.value || spaceHeld }"
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

    <!-- Minimap -->
    <Minimap
      :transform="canvas.transform"
      :containerWidth="containerWidth"
      :containerHeight="containerHeight"
      @pan="onMinimapPan"
    />

    <!-- File drop zone overlay -->
    <div v-if="fileDropActive" class="file-drop-overlay">
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
import { settings } from '../stores/settings'
import { loadUserTheme } from '../utils/themeLoader'
import NoteComponent from './NoteComponent.vue'
import ArrowLayer from './ArrowLayer.vue'
import Minimap from './Minimap.vue'

const containerRef = ref<HTMLElement | null>(null)
const spaceHeld = ref(false)
const fileDropActive = ref(false)
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
  if (!appStore.currentPage.value) return

  for (const id of appStore.currentPage.value.rootNoteIds) {
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
  history.pushAction({
    description: `Align notes (${mode})`,
    notesBefore,
    notesAfter,
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: noteIds,
    selectionAfter: noteIds,
  })
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
  history.pushAction({
    description: `Distribute notes (${axis})`,
    notesBefore,
    notesAfter,
    rootIdsBefore: null,
    rootIdsAfter: null,
    selectionBefore: noteIds,
    selectionAfter: noteIds,
  })
}

const canvas = useCanvas(containerRef)
const drag = useDrag(() => canvas.transform)
const resize = useResize(() => canvas.transform)
const boxSelection = useBoxSelection()

// Provide drag/resize and drag state to child notes
provide('startDrag', drag.startDrag)
provide('startResize', resize.startResize)
provide('dragTargetId', drag.dragTargetId)
provide('dropTargetId', drag.dropTargetId)

const rootNotes = computed(() => appStore.rootNotes.value)
const zoomPercent = computed(() => Math.round(canvas.transform.scale * 100))

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
        if (appStore.currentPage.value) {
          for (const id of appStore.currentPage.value.rootNoteIds) {
            appStore.selectedNoteIds.add(id)
          }
        }
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

    const displayName = isFolder ? `📁 ${names[i]}` : names[i]
    const filePath = fullPaths?.[i] || ''

    // Extract directory path (strip filename)
    let dirPath = filePath
    if (filePath && !isFolder) {
      const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
      if (lastSlash > 0) dirPath = filePath.substring(0, lastSlash)
    }

    const note = await appStore.createNote(notePos, undefined, {
      initialText: displayName,
      bodyText: dirPath || undefined,
      collapsed: false,
      link: filePath || undefined,
      nodeType: 'file',
      startEditing: false,
    })

    createdNoteIds.push(note.id)
  }

  appStore.clearSelection()
  for (const id of createdNoteIds) {
    appStore.selectedNoteIds.add(id)
  }
}

let resizeObserver: ResizeObserver | null = null

function onMinimapPan(x: number, y: number) {
  canvas.transform.x = x
  canvas.transform.y = y
}

// ── Per-page viewport memory ──
const pageViewports = new Map<string, { x: number; y: number; scale: number }>()

function saveCurrentViewport() {
  const pageId = appStore.currentPageId.value
  if (pageId) {
    pageViewports.set(pageId, {
      x: canvas.transform.x,
      y: canvas.transform.y,
      scale: canvas.transform.scale,
    })
  }
}

function restoreOrFitViewport() {
  const pageId = appStore.currentPageId.value
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
watch(() => appStore.currentPageId.value, (_newId, oldId) => {
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

onMounted(async () => {
  containerRef.value?.focus()

  // Fit all notes on initial launch
  nextTick(() => {
    requestAnimationFrame(() => {
      fitAllNotes()
    })
  })

  // Track container size for minimap
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
    webview.onDragDropEvent((event) => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') {
        fileDropActive.value = true
        lastDragClientX = event.payload.position.x / window.devicePixelRatio
        lastDragClientY = event.payload.position.y / window.devicePixelRatio
      } else if (event.payload.type === 'drop') {
        fileDropActive.value = false
        const paths = event.payload.paths
        const dropX = event.payload.position.x / window.devicePixelRatio
        const dropY = event.payload.position.y / window.devicePixelRatio
        const names = paths.map(p => {
          const parts = p.replace(/\\/g, '/').split('/')
          return parts[parts.length - 1] || p
        })
        createNotesFromDrop(dropX, dropY, names, paths, [])
      } else if (event.payload.type === 'leave') {
        fileDropActive.value = false
      }
    })
  } catch (e) {
    console.warn('Tauri drag-drop listener unavailable:', e)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>

<style>
.canvas-container {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-canvas);
  cursor: crosshair;
  outline: none;
}

.canvas-container.is-panning {
  cursor: grabbing;
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
</style>
