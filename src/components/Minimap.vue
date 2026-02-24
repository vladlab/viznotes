<template>
  <div
    class="minimap"
    ref="minimapEl"
    @pointerdown="onMinimapDown"
    @pointermove="onMinimapMove"
    @pointerup="onMinimapUp"
  >
    <svg :width="MAP_W" :height="MAP_H" class="minimap-svg">
      <!-- Notes as small rectangles -->
      <rect
        v-for="r in noteRects"
        :key="r.id"
        :x="r.x"
        :y="r.y"
        :width="r.w"
        :height="r.h"
        :fill="r.color"
        rx="1"
      />
      <!-- Viewport indicator -->
      <rect
        :x="vp.x"
        :y="vp.y"
        :width="vp.w"
        :height="vp.h"
        class="minimap-viewport"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { appStore } from '../stores/app'
import { getNoteColor } from '../types/note'
import type { CanvasTransform } from '../composables/useCanvas'

const props = defineProps<{
  transform: CanvasTransform
  containerWidth: number
  containerHeight: number
}>()

const emit = defineEmits<{
  (e: 'pan', x: number, y: number): void
}>()

const MAP_W = 180
const MAP_H = 120

const minimapEl = ref<HTMLElement | null>(null)
let dragging = false

// Force re-measurement of DOM sizes after layout settles
const tick = ref(0)
onMounted(() => {
  // Give DOM time to lay out notes, then force recompute
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      tick.value++
    })
  })
})

// Compute bounding box of all root notes
const bounds = computed(() => {
  const _tick = tick.value // force recompute after DOM settles
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let count = 0
  for (const note of appStore.rootNotes.value) {
    const el = document.getElementById(`note-${note.id}`)
    const w = el?.offsetWidth ?? 200
    const h = el?.offsetHeight ?? 80
    minX = Math.min(minX, note.pos.x)
    minY = Math.min(minY, note.pos.y)
    maxX = Math.max(maxX, note.pos.x + w)
    maxY = Math.max(maxY, note.pos.y + h)
    count++
  }
  if (count === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 800, w: 1000, h: 800 }

  // Proportional padding — 25% of content size on each side, minimum 100px
  const cw = maxX - minX
  const ch = maxY - minY
  const padX = Math.max(100, cw * 0.25)
  const padY = Math.max(100, ch * 0.25)
  minX -= padX
  minY -= padY
  maxX += padX
  maxY += padY

  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
})

// Scale factor to fit bounds into minimap
const scale = computed(() => {
  const b = bounds.value
  return Math.min(MAP_W / b.w, MAP_H / b.h)
})

// Map world coords to minimap coords
function toMap(wx: number, wy: number) {
  const b = bounds.value
  const s = scale.value
  return {
    x: (wx - b.minX) * s,
    y: (wy - b.minY) * s,
  }
}

const noteRects = computed(() => {
  const _tick = tick.value
  const rects: { id: string; x: number; y: number; w: number; h: number; color: string }[] = []
  const s = scale.value
  for (const note of appStore.rootNotes.value) {
    const _dep = note.pos.x + note.pos.y
    const el = document.getElementById(`note-${note.id}`)
    const w = el?.offsetWidth ?? 200
    const h = el?.offsetHeight ?? 80
    const p = toMap(note.pos.x, note.pos.y)
    const colorHex = note.color?.value ? getNoteColor(note.color.value) : getNoteColor('grey')
    rects.push({
      id: note.id,
      x: p.x,
      y: p.y,
      w: Math.max(w * s, 3),
      h: Math.max(h * s, 2),
      color: colorHex + 'bb',
    })
  }
  return rects
})

const vp = computed(() => {
  const vpLeft = -props.transform.x / props.transform.scale
  const vpTop = -props.transform.y / props.transform.scale
  const vpW = props.containerWidth / props.transform.scale
  const vpH = props.containerHeight / props.transform.scale
  const p = toMap(vpLeft, vpTop)
  const s = scale.value
  return {
    x: p.x,
    y: p.y,
    w: Math.max(vpW * s, 4),
    h: Math.max(vpH * s, 3),
  }
})

function panToMinimapPoint(clientX: number, clientY: number) {
  if (!minimapEl.value) return
  const rect = minimapEl.value.getBoundingClientRect()
  const mx = clientX - rect.left
  const my = clientY - rect.top
  const b = bounds.value
  const s = scale.value

  // Convert minimap coords to world coords (center viewport there)
  const worldX = mx / s + b.minX
  const worldY = my / s + b.minY

  const vpW = props.containerWidth / props.transform.scale
  const vpH = props.containerHeight / props.transform.scale

  emit('pan', -(worldX - vpW / 2) * props.transform.scale, -(worldY - vpH / 2) * props.transform.scale)
}

function onMinimapDown(e: PointerEvent) {
  dragging = true
  ;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
  panToMinimapPoint(e.clientX, e.clientY)
}

function onMinimapMove(e: PointerEvent) {
  if (!dragging) return
  panToMinimapPoint(e.clientX, e.clientY)
}

function onMinimapUp() {
  dragging = false
}
</script>

<style>
.minimap {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 100;
  background: var(--minimap-bg);
  border: 1px solid var(--border-input);
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  backdrop-filter: blur(4px);
}

.minimap-svg {
  display: block;
  overflow: hidden;
}

.minimap-viewport {
  fill: var(--minimap-viewport-fill);
  stroke: var(--minimap-viewport-stroke);
  stroke-width: 1;
}
</style>
