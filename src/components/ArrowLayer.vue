<template>
  <svg class="arrow-layer" :style="{ transform: transformCSS }">
    <defs>
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
      />
      <path
        :d="arrow.headPath"
        :fill="selectedArrowIds.has(arrow.id) ? accentColor : arrow.color"
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
    />
    <path
      v-if="dragging.active && dragging.headPath"
      :d="dragging.headPath"
      :fill="accentColor"
      :opacity="dragging.mode === 'create' ? 0.7 : 1"
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
import { reactive, ref, computed, watchEffect, watch, toRaw, onMounted } from 'vue'
import { appStore } from '../stores/app'
import { history } from '../stores/history'
import { settings } from '../stores/settings'
import { themeReloadCount } from '../utils/themeLoader'
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
  const _reload = themeReloadCount.value
  return getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888'
})
const accentColor = computed(() => {
  const _theme = settings.theme
  const _reload = themeReloadCount.value
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#42a5f5'
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
  headPath: '',
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

// ── Note rect caching ──

// Cache for note rects during drag sessions
const noteRectCache = new Map<string, NoteRect>()

// Cached container rect — refreshed once per recomputeArrows call
let cachedContainerRect: DOMRect | null = null
let cachedContainerEl: Element | null = null

function refreshContainerRect() {
  if (!cachedContainerEl) {
    cachedContainerEl = document.querySelector('.canvas-container')
  }
  cachedContainerRect = cachedContainerEl?.getBoundingClientRect() ?? null
}

function clearRectCache() {
  noteRectCache.clear()
}

function getNoteRect(noteId: string): NoteRect | null {
  // During drag, use cache for non-moving notes
  if (appStore.dragSessionNoteIds.size > 0 && !appStore.dragSessionNoteIds.has(noteId)) {
    const cached = noteRectCache.get(noteId)
    if (cached) return cached
  }

  const el = document.getElementById(`note-${noteId}`)
  if (!el) return null
  if (!cachedContainerRect) return null

  const domRect = el.getBoundingClientRect()
  const t = props.transform
  const cr = cachedContainerRect

  const x = (domRect.left - cr.left - t.x) / t.scale
  const y = (domRect.top - cr.top - t.y) / t.scale
  const w = domRect.width / t.scale
  const h = domRect.height / t.scale

  const rect: NoteRect = { id: noteId, x, y, w, h, cx: x + w / 2, cy: y + h / 2 }

  // Cache the result during drag
  if (appStore.dragSessionNoteIds.size > 0) {
    noteRectCache.set(noteId, rect)
  }

  return rect
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

  // Shorten line so it stops at the base of the arrowhead (12px back from tip)
  const approachDx = x2 - cp2x
  const approachDy = y2 - cp2y
  const approachDist = Math.sqrt(approachDx * approachDx + approachDy * approachDy) || 1
  const shortenedX2 = x2 - (approachDx / approachDist) * 10
  const shortenedY2 = y2 - (approachDy / approachDist) * 10

  return `M${x1},${y1} C${cp1x},${cp1y} ${cp2x},${cp2y} ${shortenedX2},${shortenedY2}`
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
  // Use cached container rect if available, otherwise query fresh
  const cr = cachedContainerRect ?? document.querySelector('.canvas-container')?.getBoundingClientRect()
  if (!cr) return { x: 0, y: 0 }
  return {
    x: (clientX - cr.left - t.x) / t.scale,
    y: (clientY - cr.top - t.y) / t.scale,
  }
}

// ── Rendered arrows ──

interface RenderedArrow { id: string; path: string; headPath: string; color: string; dashed: boolean }
const renderedArrows = ref<RenderedArrow[]>([])

/** Resolve arrow color: 'default' uses theme muted, named colors use CSS vars */
function resolveArrowColor(arrow: { color: string }): string {
  if (!arrow.color || arrow.color === 'default') return arrowColor.value
  return getComputedStyle(document.documentElement).getPropertyValue(`--note-${arrow.color}`).trim() || arrowColor.value
}

/** Build arrowhead triangle path from tip point and approach angle */
function buildArrowheadPath(
  tipX: number, tipY: number, cp2x: number, cp2y: number
): string {
  const angle = Math.atan2(tipY - cp2y, tipX - cp2x)
  const length = 12
  const halfWidth = 5
  // Two base corners of the triangle
  const bx1 = tipX - Math.cos(angle) * length - Math.cos(angle - Math.PI / 2) * halfWidth
  const by1 = tipY - Math.sin(angle) * length - Math.sin(angle - Math.PI / 2) * halfWidth
  const bx2 = tipX - Math.cos(angle) * length + Math.cos(angle - Math.PI / 2) * halfWidth
  const by2 = tipY - Math.sin(angle) * length + Math.sin(angle - Math.PI / 2) * halfWidth
  return `M${tipX},${tipY} L${bx1},${by1} L${bx2},${by2} Z`
}

/** Extract arrowhead path from an SVG cubic bezier path string */
function headPathFromCubic(pathStr: string): string {
  // Path format: M x1,y1 C cp1x,cp1y cp2x,cp2y x2,y2
  const nums = pathStr.match(/-?[\d.]+/g)
  if (!nums || nums.length < 8) return ''
  const cp2x = parseFloat(nums[4])
  const cp2y = parseFloat(nums[5])
  const tipX = parseFloat(nums[6])
  const tipY = parseFloat(nums[7])
  return buildArrowheadPath(tipX, tipY, cp2x, cp2y)
}

function recomputeArrows() {
  // Refresh container rect once per recompute pass
  refreshContainerRect()
  if (!cachedContainerRect) { renderedArrows.value = []; return }

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

    // Compute arrowhead from original tip + approach direction
    const d2 = anchorDirection(tgtAnchor)
    const dx = tp.x - sp.x
    const dy = tp.y - sp.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const curvature = Math.max(30, Math.min(dist * 0.4, 150))
    const cp2x = tp.x + d2.dx * curvature
    const cp2y = tp.y + d2.dy * curvature
    const headPath = buildArrowheadPath(tp.x, tp.y, cp2x, cp2y)

    results.push({ id: arrow.id, path, headPath, color: resolveArrowColor(arrow), dashed: arrow.dashed ?? false })
  }

  renderedArrows.value = results
}

// Register direct callback so drag/resize can trigger recompute
appStore.setArrowRecompute(recomputeArrows)

// Re-resolve arrow colors when user theme CSS is reloaded
watch(themeReloadCount, () => recomputeArrows())

// Recompute on structural changes: arrow add/remove
// Note position changes during drag are handled by triggerArrowRecompute() callback.
// Non-drag position changes (undo/redo, alignment) call triggerArrowRecompute() explicitly.
watch(() => appStore.arrows.size, () => {
  clearRectCache()
  requestAnimationFrame(recomputeArrows)
}, { flush: 'post' })

// Clear rect cache when drag session ends
watch(() => appStore.dragSessionNoteIds.size, (newSize, oldSize) => {
  if (newSize === 0 && oldSize > 0) {
    clearRectCache()
    requestAnimationFrame(recomputeArrows)
  }
})

// Initial recompute after mount (arrows may already be loaded before ArrowLayer mounts)
onMounted(() => {
  requestAnimationFrame(recomputeArrows)
})

// Recompute after page navigation (arrows.size may not change between pages)
watch(() => appStore.currentPageId.value, () => {
  clearRectCache()
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
      dragging.headPath = headPathFromCubic(dragging.path)
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
  dragging.headPath = headPathFromCubic(dragging.path)
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
  dragging.headPath = ''
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
  dragging.headPath = ''
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
