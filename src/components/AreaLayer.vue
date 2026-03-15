<template>
  <div class="area-layer" :style="{ transform: transformCSS }">
    <div
      v-for="area in pageAreas"
      :key="area.id"
      class="canvas-area"
      :class="{ 'area-selected': selectedAreaId === area.id }"
      :style="areaStyle(area)"
      @pointerdown.stop="onAreaPointerDown(area, $event)"
      @dblclick.stop="onAreaDoubleClick(area)"
      @contextmenu.prevent.stop="showAreaMenu(area, $event)"
    >
      <!-- Title label (outside, above top-left) -->
      <div class="area-title" :style="{ color: area.color }">
        <span v-if="area.jumpNumber" class="area-jump-badge">{{ area.jumpNumber }}</span>
        <span v-if="editingAreaId === area.id" class="area-title-edit-wrap">
          <input
            ref="titleInputRef"
            class="area-title-input"
            :value="area.title"
            @input="area.title = ($event.target as HTMLInputElement).value"
            @blur="finishEdit(area)"
            @keydown.enter="finishEdit(area)"
            @keydown.escape="finishEdit(area)"
            spellcheck="false"
          />
        </span>
        <span v-else class="area-title-text">{{ area.title || 'Area' }}</span>
      </div>

      <!-- Resize handle (bottom-right) -->
      <div class="area-resize-handle" @pointerdown.stop="onResizeStart(area, $event)" />
    </div>
  </div>

  <!-- Area context menu -->
  <Teleport to="body">
    <div
      v-if="menuVisible"
      class="context-menu"
      :style="{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }"
      @pointerdown.stop
    >
      <button @click="editTitle">Rename</button>
      <div class="context-separator" />
      <div class="context-colors">
        <button
          v-for="c in AREA_COLORS"
          :key="c.value"
          class="color-swatch"
          :class="{ active: menuArea?.color === c.value }"
          :style="{ backgroundColor: c.value }"
          :title="c.name"
          @click="setColor(c.value)"
        />
      </div>
      <div class="context-separator" />
      <div class="area-jump-picker">
        <span class="area-jump-label">Jump key:</span>
        <button
          v-for="n in 9"
          :key="n"
          class="area-jump-btn"
          :class="{ active: menuArea?.jumpNumber === n, taken: jumpTaken(n) && menuArea?.jumpNumber !== n }"
          @click="setJumpNumber(n)"
        >{{ n }}</button>
        <button
          class="area-jump-btn"
          :class="{ active: menuArea?.jumpNumber === 0 }"
          @click="setJumpNumber(0)"
        >✕</button>
      </div>
      <div class="context-separator" />
      <button class="danger" @click="deleteArea">Delete area</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { Area } from '../types/area'
import { AREA_COLORS } from '../types/area'
import { appStore } from '../stores/app'
import { getStorage } from '../stores/state'

const props = defineProps<{
  transformCSS: string
  panePageId: string | null
}>()

const emit = defineEmits<{
  (e: 'jumpToArea', area: Area): void
}>()

const selectedAreaId = ref<string | null>(null)
const editingAreaId = ref<string | null>(null)
const titleInputRef = ref<HTMLInputElement[] | null>(null)

// Context menu
const menuVisible = ref(false)
const menuPos = ref({ x: 0, y: 0 })
const menuArea = ref<Area | null>(null)
let menuCleanup: (() => void) | null = null

const pageAreas = computed(() => {
  const pid = props.panePageId
  if (!pid) return []
  const result: Area[] = []
  for (const area of appStore.areas.values()) {
    if (area.pageId === pid) result.push(area)
  }
  return result
})

function areaStyle(area: Area) {
  return {
    left: `${area.pos.x}px`,
    top: `${area.pos.y}px`,
    width: `${area.width}px`,
    height: `${area.height}px`,
    '--area-color': area.color,
  }
}

// ── Interaction ──

function onAreaPointerDown(area: Area, e: PointerEvent) {
  if (e.button !== 0) return

  // First click selects; only an already-selected area can be dragged
  if (selectedAreaId.value !== area.id) {
    selectedAreaId.value = area.id
    return
  }

  // Already selected — start drag
  const startX = e.clientX
  const startY = e.clientY
  const startPos = { x: area.pos.x, y: area.pos.y }
  let moved = false

  const scaleMatch = props.transformCSS.match(/scale\(([\d.]+)\)/)
  const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1

  const onMove = (ev: PointerEvent) => {
    const dx = (ev.clientX - startX) / scale
    const dy = (ev.clientY - startY) / scale
    if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    moved = true
    area.pos.x = startPos.x + dx
    area.pos.y = startPos.y + dy
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    if (moved) saveArea(area)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onResizeStart(area: Area, e: PointerEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const startW = area.width
  const startH = area.height

  const scaleMatch = props.transformCSS.match(/scale\(([\d.]+)\)/)
  const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1

  const onMove = (ev: PointerEvent) => {
    area.width = Math.max(200, startW + (ev.clientX - startX) / scale)
    area.height = Math.max(100, startH + (ev.clientY - startY) / scale)
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    saveArea(area)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onAreaDoubleClick(area: Area) {
  editingAreaId.value = area.id
  nextTick(() => {
    if (titleInputRef.value?.[0]) {
      titleInputRef.value[0].focus()
      titleInputRef.value[0].select()
    }
  })
}

function finishEdit(area: Area) {
  editingAreaId.value = null
  saveArea(area)
}

// ── Context menu ──

function showAreaMenu(area: Area, e: MouseEvent) {
  selectedAreaId.value = area.id
  menuArea.value = area
  menuPos.value = { x: e.clientX, y: e.clientY }
  menuVisible.value = true

  const dismiss = (ev: PointerEvent) => {
    if (!(ev.target as HTMLElement)?.closest('.context-menu')) {
      closeMenu()
    }
  }
  setTimeout(() => window.addEventListener('pointerdown', dismiss), 0)
  menuCleanup = () => window.removeEventListener('pointerdown', dismiss)
}

function closeMenu() {
  menuVisible.value = false
  menuArea.value = null
  if (menuCleanup) { menuCleanup(); menuCleanup = null }
}

function editTitle() {
  if (menuArea.value) {
    editingAreaId.value = menuArea.value.id
    closeMenu()
    nextTick(() => {
      if (titleInputRef.value?.[0]) {
        titleInputRef.value[0].focus()
        titleInputRef.value[0].select()
      }
    })
  }
}

function setColor(color: string) {
  if (menuArea.value) {
    menuArea.value.color = color
    saveArea(menuArea.value)
  }
  closeMenu()
}

function setJumpNumber(n: number) {
  if (!menuArea.value) return
  // Clear any other area with this jump number on this page
  if (n > 0) {
    for (const area of pageAreas.value) {
      if (area.id !== menuArea.value.id && area.jumpNumber === n) {
        area.jumpNumber = 0
        saveArea(area)
      }
    }
  }
  menuArea.value.jumpNumber = n
  saveArea(menuArea.value)
  closeMenu()
}

function jumpTaken(n: number): boolean {
  return pageAreas.value.some(a => a.jumpNumber === n && a.id !== menuArea.value?.id)
}

async function deleteArea() {
  if (!menuArea.value) return
  const id = menuArea.value.id
  closeMenu()
  appStore.areas.delete(id)
  const storage = getStorage()
  await storage.deleteArea(id)
}

async function saveArea(area: Area) {
  const storage = getStorage()
  await storage.saveArea(area)
}

// ── Keyboard jump (exposed for parent) ──

function jumpToNumber(n: number) {
  const area = pageAreas.value.find(a => a.jumpNumber === n)
  if (area) emit('jumpToArea', area)
}

// ── Deselect on background click ──
function onBackgroundClick() {
  selectedAreaId.value = null
}

onMounted(() => {
  window.addEventListener('pointerdown', handleGlobalClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleGlobalClick)
  if (menuCleanup) { menuCleanup(); menuCleanup = null }
})

function handleGlobalClick(e: PointerEvent) {
  if (!(e.target as HTMLElement)?.closest('.canvas-area')) {
    selectedAreaId.value = null
  }
}

defineExpose({ jumpToNumber })
</script>

<style>
.area-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  pointer-events: none;
  z-index: 0;
}

.canvas-area {
  position: absolute;
  border: 2px solid var(--area-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--area-color) 6%, transparent);
  pointer-events: auto;
  cursor: default;
  user-select: none;
}

.canvas-area:hover {
  background: color-mix(in srgb, var(--area-color) 10%, transparent);
}

.canvas-area.area-selected {
  border-width: 2.5px;
  box-shadow: 0 0 0 1px var(--area-color);
  cursor: grab;
}

.area-title {
  position: absolute;
  bottom: 100%;
  left: 0;
  padding-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  pointer-events: auto;
}

.area-title-text {
  font-size: 24px;
  font-weight: 700;
  opacity: 0.7;
}

.area-title-edit-wrap {
  display: inline-flex;
}

.area-title-input {
  font-size: 24px;
  font-weight: 700;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 3px;
  padding: 1px 4px;
  color: inherit;
  outline: none;
  min-width: 80px;
}

.area-jump-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: var(--area-color);
  color: white;
  font-size: 14px;
  font-weight: 700;
}

.area-resize-handle {
  position: absolute;
  bottom: -3px;
  right: -3px;
  width: 12px;
  height: 12px;
  cursor: se-resize;
  pointer-events: auto;
}

.area-resize-handle::after {
  content: '';
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-right: 2px solid var(--area-color);
  border-bottom: 2px solid var(--area-color);
  opacity: 0.5;
}

.canvas-area:hover .area-resize-handle::after,
.area-selected .area-resize-handle::after {
  opacity: 1;
}

/* Context menu jump picker */
.area-jump-picker {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
}

.area-jump-label {
  font-size: 0.78em;
  color: var(--text-faint);
  margin-right: 4px;
}

.area-jump-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-input);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.78em;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.area-jump-btn:hover { background: var(--bg-surface-hover); }
.area-jump-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
.area-jump-btn.taken { opacity: 0.35; }
</style>
