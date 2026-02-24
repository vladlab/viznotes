<template>
  <svg class="arrow-layer" :style="{ transform: transformCSS }">
    <defs>
      <!-- Generate arrowhead markers for each unique color in use -->
      <marker
        v-for="color in activeMarkerColors"
        :key="color"
        :id="`arrowhead-${color.replace(/[^a-zA-Z0-9]/g, '_')}`"
        markerWidth="10"
        markerHeight="8"
        refX="7"
        refY="4"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0,0.5 L9,4 L0,7.5 L1.5,4 Z" :fill="color" />
      </marker>
    </defs>

    <!-- Existing arrows -->
    <g
      v-for="arrow in renderedArrows"
      :key="arrow.id"
      :id="`arrow-${arrow.id}`"
      class="arrow-group"
      :class="{ selected: selectedArrowIds.has(arrow.id) }"
      :style="{ opacity: dragging.active && dragging.arrowId === arrow.id ? 0 : 1 }"
    >
      <path
        :d="arrow.path"
        class="arrow-hitbox"
        fill="none"
        stroke="transparent"
        stroke-width="16"
        @pointerdown.stop="onArrowPointerDown(arrow.id, $event)"
        @contextmenu.prevent.stop="onArrowContextMenu(arrow.id, $event)"
      />
      <path
        :d="arrow.path"
        class="arrow-line"
        fill="none"
        :stroke="selectedArrowIds.has(arrow.id) ? accentColor : arrow.color"
        stroke-width="2"
        :stroke-dasharray="arrow.dashed ? '8,5' : 'none'"
        :marker-end="`url(#arrowhead-${(selectedArrowIds.has(arrow.id) ? accentColor : arrow.color).replace(/[^a-zA-Z0-9]/g, '_')})`"
      />
    </g>

    <!-- Preview arrow (creation or reconnection) -->
    <path
      v-if="dragging.active && dragging.path"
      :d="dragging.path"
      fill="none"
      :stroke="accentColor"
      stroke-width="2"
      :stroke-dasharray="dragging.mode === 'create' ? '6,4' : 'none'"
      :opacity="dragging.mode === 'create' ? 0.7 : 1"
      :marker-end="`url(#arrowhead-${accentColor.replace(/[^a-zA-Z0-9]/g, '_')})`"
    />

    <!-- Source connector handles on selected notes -->
    <template v-for="handle in connectorHandles" :key="handle.noteId + handle.side">
      <circle
        :cx="handle.x"
        :cy="handle.y"
        r="20"
        class="connector-hit-area"
        @pointerdown.stop="onConnectorPointerDown(handle, $event)"
      />
      <circle
        :cx="handle.x"
        :cy="handle.y"
        r="10"
        class="connector-handle"
        @pointerdown.stop="onConnectorPointerDown(handle, $event)"
      />
    </template>

    <!-- Target snap points during drag -->
    <template v-if="dragging.active">
      <circle
        v-for="snap in targetSnapPoints"
        :key="snap.noteId + snap.side"
        :cx="snap.x"
        :cy="snap.y"
        :r="snap.isHovered ? 14 : 10"
        class="target-snap-point"
        :class="{ hovered: snap.isHovered }"
      />
    </template>
  </svg>

  <!-- Arrow context menu -->
  <Teleport to="body">
    <div
      v-if="contextMenu.visible"
      class="arrow-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @pointerdown.stop
    >
      <div class="context-colors">
        <button
          class="color-swatch default-swatch"
          :class="{ active: contextMenu.arrowColor === 'default' }"
          @click="setArrowColor('default')"
          title="Default"
        />
        <button
          v-for="name in NOTE_COLOR_NAMES"
          :key="name"
          class="color-swatch"
          :class="{ active: contextMenu.arrowColor === name }"
          :style="{ backgroundColor: `var(--note-${name})` }"
          @click="setArrowColor(name)"
        />
      </div>
      <div class="context-separator" />
      <button @click="toggleArrowDashed">
        {{ contextMenu.arrowDashed ? '✓ ' : '' }}Dashed
      </button>
      <div class="context-separator" />
      <button class="danger" @click="deleteContextArrow">Delete arrow</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watchEffect, toRaw } from 'vue'
import { appStore } from '../stores/app'
import { history } from '../stores/history'
import { settings } from '../stores/settings'
import { anchorDirection } from '../types/arrow'
import { NOTE_COLOR_NAMES } from '../types/note'
import type { AnchorSide, Arrow } from '../types/arrow'
import type { CanvasTransform } from '../composables/useCanvas'

const props = defineProps<{
  transform: CanvasTransform
  transformCSS: string
}>()

const selectedArrowIds = appStore.selectedArrowIds

const arrowColor = computed(() => {
  const _theme = settings.theme
  return getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888'
})
const accentColor = computed(() => {
  const _theme = settings.theme
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#42a5f5'
})

/** Collect unique colors used by rendered arrows + accent for markers */
const activeMarkerColors = computed(() => {
  const colors = new Set<string>()
  colors.add(arrowColor.value)
  colors.add(accentColor.value)
  for (const a of renderedArrows.value) {
    colors.add(a.color)
  }
  return [...colors]
})

// ── Arrow context menu ──

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  arrowId: '',
  arrowColor: 'default',
  arrowDashed: false,
})

function onArrowContextMenu(arrowId: string, e: MouseEvent) {
  const arrow = appStore.arrows.get(arrowId)
  if (!arrow) return

  // Select the arrow
  appStore.clearSelection()
  selectedArrowIds.clear()
  selectedArrowIds.add(arrowId)
  recomputeArrows()

  contextMenu.arrowId = arrowId
  contextMenu.arrowColor = arrow.color || 'default'
  contextMenu.arrowDashed = arrow.dashed ?? false
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.visible = true

  const close = (ev: Event) => {
    if (ev.type === 'pointerdown') {
      const menu = document.querySelector('.arrow-context-menu')
      if (menu && ev.target instanceof Node && menu.contains(ev.target)) return
    }
    if (ev instanceof KeyboardEvent && ev.key !== 'Escape') return
    contextMenu.visible = false
    window.removeEventListener('pointerdown', close, true)
    window.removeEventListener('keydown', close)
  }
  setTimeout(() => {
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close)
  }, 0)
}

function setArrowColor(color: string) {
  const arrow = appStore.arrows.get(contextMenu.arrowId)
  if (!arrow) return
  arrow.color = color
  arrow.updatedAt = Date.now()
  appStore.updateArrow(arrow)
  contextMenu.arrowColor = color
  recomputeArrows()
}

function toggleArrowDashed() {
  const arrow = appStore.arrows.get(contextMenu.arrowId)
  if (!arrow) return
  arrow.dashed = !arrow.dashed
  arrow.updatedAt = Date.now()
  appStore.updateArrow(arrow)
  contextMenu.arrowDashed = arrow.dashed
  recomputeArrows()
}

async function deleteContextArrow() {
  contextMenu.visible = false
  await appStore.deleteArrow(contextMenu.arrowId)
  selectedArrowIds.delete(contextMenu.arrowId)
}

// ── Unified drag state (shared between create & reconnect) ──

const dragging = reactive({
  active: false,
  mode: 'create' as 'create' | 'reconnect',

  // The "fixed" anchor (the end that's not being dragged)
  fixedNoteId: '',
  fixedAnchor: 'right' as AnchorSide,

  // Which endpoint is loose ('source' means we're dragging source end, fixed is target)
  looseEndpoint: 'target' as 'source' | 'target',

  // For reconnect: the arrow being modified
  arrowId: '',
  arrowBefore: null as Arrow | null,

  // Preview
  path: '',
  hoveredNoteId: null as string | null,
  hoveredAnchor: null as AnchorSide | null,
})

const targetSnapPoints = ref<TargetSnap[]>([])

// ── Geometry helpers ──

interface NoteRect {
  id: string
  x: number; y: number; w: number; h: number
  cx: number; cy: number
}

function getNoteRect(noteId: string): NoteRect | null {
  const el = document.getElementById(`note-${noteId}`)
  if (!el) return null

  const domRect = el.getBoundingClientRect()
  const t = props.transform
  const containerEl = document.querySelector('.canvas-container')
  if (!containerEl) return null
  const cr = containerEl.getBoundingClientRect()

  const x = (domRect.left - cr.left - t.x) / t.scale
  const y = (domRect.top - cr.top - t.y) / t.scale
  const w = domRect.width / t.scale
  const h = domRect.height / t.scale

  return { id: noteId, x, y, w, h, cx: x + w / 2, cy: y + h / 2 }
}

function getAnchorPoint(rect: NoteRect, side: AnchorSide, offset = 4): { x: number; y: number } {
  switch (side) {
    case 'top':    return { x: rect.cx, y: rect.y - offset }
    case 'bottom': return { x: rect.cx, y: rect.y + rect.h + offset }
    case 'left':   return { x: rect.x - offset, y: rect.cy }
    case 'right':  return { x: rect.x + rect.w + offset, y: rect.cy }
  }
}

function buildBezierPath(
  x1: number, y1: number, side1: AnchorSide,
  x2: number, y2: number, side2: AnchorSide,
): string {
  const d1 = anchorDirection(side1)
  const d2 = anchorDirection(side2)

  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)
  const curvature = Math.max(30, Math.min(dist * 0.4, 150))

  const cp1x = x1 + d1.dx * curvature
  const cp1y = y1 + d1.dy * curvature
  const cp2x = x2 + d2.dx * curvature
  const cp2y = y2 + d2.dy * curvature

  return `M${x1},${y1} C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`
}

function closestAnchorSide(rect: NoteRect, wx: number, wy: number): AnchorSide {
  const sides: AnchorSide[] = ['top', 'bottom', 'left', 'right']
  let best: AnchorSide = 'top'
  let bestDist = Infinity

  for (const side of sides) {
    const p = getAnchorPoint(rect, side, 0)
    const d = (p.x - wx) ** 2 + (p.y - wy) ** 2
    if (d < bestDist) { bestDist = d; best = side }
  }
  return best
}

function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const t = props.transform
  const containerEl = document.querySelector('.canvas-container')
  if (!containerEl) return { x: 0, y: 0 }
  const cr = containerEl.getBoundingClientRect()
  return {
    x: (clientX - cr.left - t.x) / t.scale,
    y: (clientY - cr.top - t.y) / t.scale,
  }
}

// ── Rendered arrows ──

interface RenderedArrow { id: string; path: string; color: string; dashed: boolean }
const renderedArrows = ref<RenderedArrow[]>([])

/** Resolve arrow color: 'default' uses theme muted, named colors use CSS vars */
function resolveArrowColor(arrow: { color: string }): string {
  if (!arrow.color || arrow.color === 'default') return arrowColor.value
  return getComputedStyle(document.documentElement).getPropertyValue(`--note-${arrow.color}`).trim() || arrowColor.value
}

function recomputeArrows() {
  const results: RenderedArrow[] = []

  for (const arrow of appStore.arrows.values()) {
    const sourceRect = getNoteRect(arrow.sourceNoteId)
    const targetRect = getNoteRect(arrow.targetNoteId)
    if (!sourceRect || !targetRect) continue

    const srcAnchor = arrow.sourceAnchor || 'right'
    const tgtAnchor = arrow.targetAnchor || 'left'

    const sp = getAnchorPoint(sourceRect, srcAnchor)
    const tp = getAnchorPoint(targetRect, tgtAnchor)
    const path = buildBezierPath(sp.x, sp.y, srcAnchor, tp.x, tp.y, tgtAnchor)
    results.push({ id: arrow.id, path, color: resolveArrowColor(arrow), dashed: arrow.dashed ?? false })
  }

  renderedArrows.value = results
}

// Register direct callback so drag/resize can trigger recompute
appStore.setArrowRecompute(recomputeArrows)

// Reactive recompute on structural changes (arrow add/remove, note changes outside drag)
watchEffect(() => {
  const _ = appStore.arrows.size
  for (const arrow of appStore.arrows.values()) {
    const s = appStore.notes.get(arrow.sourceNoteId)
    const t = appStore.notes.get(arrow.targetNoteId)
    if (s) { s.pos.x; s.pos.y; s.width; s.height; s.zIndex }
    if (t) { t.pos.x; t.pos.y; t.width; t.height; t.zIndex }
  }
  requestAnimationFrame(recomputeArrows)
}, { flush: 'post' })

// ── Connector handles on selected notes ──

interface ConnectorHandle {
  noteId: string
  side: AnchorSide
  x: number; y: number
}

const connectorHandles = ref<ConnectorHandle[]>([])

watchEffect(() => {
  if (appStore.editingNoteId.value || dragging.active) {
    connectorHandles.value = []
    return
  }

  const handles: ConnectorHandle[] = []

  for (const noteId of appStore.selectedNoteIds) {
    const note = appStore.notes.get(noteId)
    if (!note) continue
    const _dep = note.pos.x + note.pos.y + (Number(note.width) || 0) + (Number(note.height) || 0)

    const rect = getNoteRect(noteId)
    if (!rect) continue

    for (const side of ['top', 'bottom', 'left', 'right'] as AnchorSide[]) {
      const p = getAnchorPoint(rect, side)
      handles.push({ noteId, side, x: p.x, y: p.y })
    }
  }

  connectorHandles.value = handles
}, { flush: 'post' })

// ── Target snap point type ──

interface TargetSnap {
  noteId: string
  side: AnchorSide
  x: number; y: number
  isHovered: boolean
}

// ── Shared drag move/up logic ──

function handleDragMove(ev: PointerEvent) {
  const world = clientToWorld(ev.clientX, ev.clientY)

  const fixedRect = getNoteRect(dragging.fixedNoteId)
  if (!fixedRect) return
  const fp = getAnchorPoint(fixedRect, dragging.fixedAnchor)

  // Find note under cursor (exclude the fixed note)
  const hoverNoteId = findNoteAtPoint(ev.clientX, ev.clientY, dragging.fixedNoteId)

  if (hoverNoteId) {
    const targetRect = getNoteRect(hoverNoteId)
    if (targetRect) {
      dragging.hoveredNoteId = hoverNoteId
      const closestSide = closestAnchorSide(targetRect, world.x, world.y)
      dragging.hoveredAnchor = closestSide

      // Show snap points
      const snaps: TargetSnap[] = []
      for (const side of ['top', 'bottom', 'left', 'right'] as AnchorSide[]) {
        const p = getAnchorPoint(targetRect, side)
        snaps.push({ noteId: hoverNoteId, side, x: p.x, y: p.y, isHovered: side === closestSide })
      }
      targetSnapPoints.value = snaps

      // Build preview: fixed end → hovered anchor
      const tp = getAnchorPoint(targetRect, closestSide)
      if (dragging.looseEndpoint === 'target') {
        dragging.path = buildBezierPath(fp.x, fp.y, dragging.fixedAnchor, tp.x, tp.y, closestSide)
      } else {
        // Dragging source: loose is source, fixed is target
        dragging.path = buildBezierPath(tp.x, tp.y, closestSide, fp.x, fp.y, dragging.fixedAnchor)
      }
      return
    }
  }

  // No target — free preview toward cursor
  dragging.hoveredNoteId = null
  dragging.hoveredAnchor = null
  targetSnapPoints.value = []

  const d = dragging.looseEndpoint === 'target'
    ? anchorDirection(dragging.fixedAnchor)
    : anchorDirection(dragging.fixedAnchor)  // direction from fixed side
  const dist = Math.sqrt((world.x - fp.x) ** 2 + (world.y - fp.y) ** 2)
  const curve = Math.max(30, Math.min(dist * 0.3, 100))

  if (dragging.looseEndpoint === 'target') {
    dragging.path = `M${fp.x},${fp.y} C${fp.x + d.dx * curve},${fp.y + d.dy * curve} ${world.x},${world.y} ${world.x},${world.y}`
  } else {
    dragging.path = `M${world.x},${world.y} C${world.x},${world.y} ${fp.x + d.dx * curve},${fp.y + d.dy * curve} ${fp.x},${fp.y}`
  }
}

async function handleDragUp(ev: PointerEvent) {
  window.removeEventListener('pointermove', handleDragMove)
  window.removeEventListener('pointerup', handleDragUp)

  const targetNoteId = dragging.hoveredNoteId
  const targetAnchor = dragging.hoveredAnchor
  const mode = dragging.mode
  const arrowId = dragging.arrowId
  const arrowBefore = dragging.arrowBefore

  dragging.active = false
  dragging.path = ''
  targetSnapPoints.value = []

  if (mode === 'create') {
    if (targetNoteId && targetAnchor) {
      // Create new arrow: source is fixed, target is where we dropped
      if (dragging.looseEndpoint === 'target') {
        await appStore.createArrow(dragging.fixedNoteId, targetNoteId, dragging.fixedAnchor, targetAnchor)
      } else {
        await appStore.createArrow(targetNoteId, dragging.fixedNoteId, targetAnchor, dragging.fixedAnchor)
      }
    }
  } else if (mode === 'reconnect') {
    const arrow = appStore.arrows.get(arrowId)
    if (!arrow) return

    if (targetNoteId && targetAnchor) {
      // Update the arrow endpoint
      if (dragging.looseEndpoint === 'source') {
        arrow.sourceNoteId = targetNoteId
        arrow.sourceAnchor = targetAnchor
      } else {
        arrow.targetNoteId = targetNoteId
        arrow.targetAnchor = targetAnchor
      }
      arrow.updatedAt = Date.now()
      await appStore.updateArrow(arrow)

      // Undo action
      history.pushAction({
        description: 'Reconnect arrow',
        notesBefore: {},
        notesAfter: {},
        arrowsBefore: { [arrowId]: arrowBefore! },
        arrowsAfter: { [arrowId]: JSON.parse(JSON.stringify(toRaw(arrow))) },
        rootIdsBefore: null,
        rootIdsAfter: null,
        selectionBefore: [],
        selectionAfter: [],
        arrowSelectionBefore: [arrowId],
        arrowSelectionAfter: [arrowId],
      })
    } else {
      // Dropped on empty space — delete the arrow
      await appStore.deleteArrow(arrowId)
    }
  }
}

function startDrag(
  mode: 'create' | 'reconnect',
  fixedNoteId: string,
  fixedAnchor: AnchorSide,
  looseEndpoint: 'source' | 'target',
  arrowId: string = '',
  arrowBefore: Arrow | null = null,
  e: PointerEvent,
) {
  dragging.active = true
  dragging.mode = mode
  dragging.fixedNoteId = fixedNoteId
  dragging.fixedAnchor = fixedAnchor
  dragging.looseEndpoint = looseEndpoint
  dragging.arrowId = arrowId
  dragging.arrowBefore = arrowBefore
  dragging.path = ''
  dragging.hoveredNoteId = null
  dragging.hoveredAnchor = null
  targetSnapPoints.value = []

  window.addEventListener('pointermove', handleDragMove)
  window.addEventListener('pointerup', handleDragUp)

  handleDragMove(e)
}

// ── Arrow click / drag-to-reconnect ──

function onArrowPointerDown(arrowId: string, e: PointerEvent) {
  if (e.button !== 0) return

  const arrow = appStore.arrows.get(arrowId)
  if (!arrow) return

  const world = clientToWorld(e.clientX, e.clientY)

  // Get both endpoint positions
  const sourceRect = getNoteRect(arrow.sourceNoteId)
  const targetRect = getNoteRect(arrow.targetNoteId)
  if (!sourceRect || !targetRect) return

  const srcAnchor = arrow.sourceAnchor || 'right'
  const tgtAnchor = arrow.targetAnchor || 'left'
  const sp = getAnchorPoint(sourceRect, srcAnchor)
  const tp = getAnchorPoint(targetRect, tgtAnchor)

  // Distance to each endpoint
  const distSource = Math.sqrt((world.x - sp.x) ** 2 + (world.y - sp.y) ** 2)
  const distTarget = Math.sqrt((world.x - tp.x) ** 2 + (world.y - tp.y) ** 2)

  // If click is near an endpoint (within ~30 world px), start reconnect
  const ENDPOINT_THRESHOLD = 30
  const nearSource = distSource < ENDPOINT_THRESHOLD
  const nearTarget = distTarget < ENDPOINT_THRESHOLD

  if (nearSource || nearTarget) {
    // Use threshold + start a delayed drag to distinguish click from drag
    const startX = e.clientX
    const startY = e.clientY
    const MOVE_THRESHOLD = 5
    let moved = false

    const arrowBefore = JSON.parse(JSON.stringify(toRaw(arrow))) as Arrow

    const checkMove = (ev: PointerEvent) => {
      if (moved) return
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
        moved = true
        window.removeEventListener('pointermove', checkMove)
        window.removeEventListener('pointerup', checkUp)

        // Determine which end to detach (closest to click, or if both close, the nearest)
        const detachSource = nearSource && (!nearTarget || distSource <= distTarget)

        if (detachSource) {
          // Dragging source: fixed end is target
          startDrag('reconnect', arrow.targetNoteId, tgtAnchor as AnchorSide, 'source', arrowId, arrowBefore, ev)
        } else {
          // Dragging target: fixed end is source
          startDrag('reconnect', arrow.sourceNoteId, srcAnchor as AnchorSide, 'target', arrowId, arrowBefore, ev)
        }
      }
    }

    const checkUp = () => {
      window.removeEventListener('pointermove', checkMove)
      window.removeEventListener('pointerup', checkUp)
      if (!moved) {
        // Just a click — select
        selectArrowClick(arrowId, e)
      }
    }

    window.addEventListener('pointermove', checkMove)
    window.addEventListener('pointerup', checkUp)
  } else {
    // Click in the middle — select
    selectArrowClick(arrowId, e)
  }
}

function selectArrowClick(arrowId: string, e: PointerEvent) {
  const isCtrl = e.ctrlKey || e.metaKey
  if (isCtrl) {
    if (selectedArrowIds.has(arrowId)) {
      selectedArrowIds.delete(arrowId)
    } else {
      appStore.selectArrow(arrowId, true)
    }
  } else {
    appStore.selectArrow(arrowId, false)
  }
}

// ── Connector drag → create arrow ──

function onConnectorPointerDown(handle: ConnectorHandle, e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()

  startDrag('create', handle.noteId, handle.side, 'target', '', null, e)
}

function findNoteAtPoint(clientX: number, clientY: number, excludeId: string): string | null {
  const elements = document.elementsFromPoint(clientX, clientY)
  for (const el of elements) {
    const noteOuter = el.closest('.note-outer')
    if (noteOuter) {
      const id = noteOuter.id?.replace('note-', '')
      if (id && id !== excludeId) return id
    }
  }
  return null
}
</script>

<style>
.arrow-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  pointer-events: none;
  z-index: 2;
  overflow: visible;
}

.arrow-group {
  pointer-events: auto;
  transition: opacity 0.1s ease;
}

.arrow-hitbox {
  cursor: pointer;
}

.arrow-line {
  pointer-events: none;
  transition: stroke 0.15s ease;
}

.arrow-group.selected .arrow-line {
  stroke-width: 2.5;
}

.connector-hit-area {
  fill: transparent;
  stroke: none;
  cursor: crosshair;
  pointer-events: auto;
}

.connector-handle {
  fill: var(--accent);
  stroke: var(--bg-app);
  stroke-width: 2;
  cursor: crosshair;
  pointer-events: auto;
  opacity: 0;
  transition: opacity 0.15s ease, r 0.1s ease;
}

.arrow-layer:hover .connector-handle {
  opacity: 0.8;
}

.connector-hit-area:hover + .connector-handle,
.connector-handle:hover {
  opacity: 1 !important;
  r: 12;
  fill: var(--accent-text);
}

.target-snap-point {
  fill: var(--accent-bg);
  stroke: var(--accent);
  stroke-width: 1.5;
  pointer-events: none;
  transition: r 0.1s ease, fill 0.1s ease;
}

.target-snap-point.hovered {
  fill: var(--accent);
  stroke: var(--text-primary);
  stroke-width: 2;
}

/* Arrow context menu */
.arrow-context-menu {
  position: fixed;
  z-index: 10000;
  background: var(--controls-bg);
  border: 1px solid var(--border-main);
  border-radius: 8px;
  padding: 4px;
  min-width: 160px;
  box-shadow: var(--shadow-menu);
}

.arrow-context-menu button {
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

.arrow-context-menu button:hover {
  background: var(--bg-surface-hover);
}

.arrow-context-menu button.danger {
  color: var(--danger);
}

.arrow-context-menu .context-separator {
  height: 1px;
  background: var(--border-main);
  margin: 4px 8px;
}

.arrow-context-menu .context-colors {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  flex-wrap: wrap;
}

.arrow-context-menu .color-swatch {
  width: 20px !important;
  height: 20px !important;
  min-width: 20px;
  border-radius: 50% !important;
  padding: 0 !important;
  border: 2px solid transparent !important;
  cursor: pointer;
}

.arrow-context-menu .color-swatch.active {
  border-color: var(--accent) !important;
}

.arrow-context-menu .default-swatch {
  background: var(--text-muted) !important;
}
</style>
