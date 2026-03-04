<template>
  <div class="split-view" :class="{ 'is-split': appStore.splitActive.value }">
    <!-- Primary pane (always visible) -->
    <div
      class="pane"
      :class="{ 'pane-active': appStore.activePaneId.value === primaryPane?.id }"
      :style="primaryPaneStyle"
      @pointerdown="activatePrimary"
    >
      <CanvasView
        v-if="primaryPane?.pageId"
        :paneId="primaryPane.id"
        @activate="activatePrimary"
      />
      <div v-else class="pane-empty">
        <p>Select a page from the sidebar</p>
      </div>
    </div>

    <!-- Divider (only when split) -->
    <div
      v-if="appStore.splitActive.value"
      class="split-divider"
      @pointerdown="startDividerDrag"
    >
      <div class="divider-grip" />
    </div>

    <!-- Secondary pane -->
    <div
      v-if="appStore.splitActive.value"
      class="pane"
      :class="{ 'pane-active': appStore.activePaneId.value === secondaryPane?.id }"
      :style="secondaryPaneStyle"
      @pointerdown="activateSecondary"
    >
      <CanvasView
        v-if="secondaryPane?.pageId"
        :paneId="secondaryPane.id"
        @activate="activateSecondary"
      />
      <div v-else class="pane-empty">
        <p>Select a page from the sidebar</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { appStore } from '../stores/app'
import { loadPage } from '../stores/pages'
import { panes, activePaneId } from '../stores/panes'
import CanvasView from './CanvasView.vue'

const MIN_PANE_WIDTH = 300
const splitRatio = ref(0.5)

const primaryPane = computed(() => {
  const all = Array.from(panes.values())
  return all[0] ?? null
})

const secondaryPane = computed(() => {
  const all = Array.from(panes.values())
  return all.length > 1 ? all[1] : null
})

const primaryPaneStyle = computed(() => {
  if (!appStore.splitActive.value) return { flex: '1' }
  return { flex: `0 0 calc(${splitRatio.value * 100}% - 3px)` }
})

const secondaryPaneStyle = computed(() => {
  return { flex: `0 0 calc(${(1 - splitRatio.value) * 100}% - 3px)` }
})

function activatePrimary() {
  if (primaryPane.value) {
    appStore.setActivePane(primaryPane.value.id)
  }
}

function activateSecondary() {
  if (secondaryPane.value) {
    appStore.setActivePane(secondaryPane.value.id)
  }
}

// ── Divider drag ──

let dragging = false

function startDividerDrag(e: PointerEvent) {
  dragging = true
  ;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
  document.addEventListener('pointermove', onDividerMove)
  document.addEventListener('pointerup', stopDividerDrag)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onDividerMove(e: PointerEvent) {
  if (!dragging) return
  const container = document.querySelector('.split-view') as HTMLElement
  if (!container) return
  const rect = container.getBoundingClientRect()
  const x = e.clientX - rect.left
  let ratio = x / rect.width
  const minRatio = MIN_PANE_WIDTH / rect.width
  ratio = Math.max(minRatio, Math.min(1 - minRatio, ratio))
  splitRatio.value = ratio
}

function stopDividerDrag() {
  dragging = false
  document.removeEventListener('pointermove', onDividerMove)
  document.removeEventListener('pointerup', stopDividerDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onUnmounted(() => {
  document.removeEventListener('pointermove', onDividerMove)
  document.removeEventListener('pointerup', stopDividerDrag)
})
</script>

<style>
.split-view {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.pane {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  transition: box-shadow 0.2s ease;
}

.pane-active {
  z-index: 2;
}

.is-split .pane:not(.pane-active) {
  z-index: 0;
}

/* Shadow on the divider edge of the active pane, casting "over" the inactive one */
.is-split .pane:first-child.pane-active {
  box-shadow: 8px 0 20px -4px rgba(0, 0, 0, 0.5);
}

.is-split .split-divider + .pane.pane-active {
  box-shadow: -8px 0 20px -4px rgba(0, 0, 0, 0.5);
}

.is-split .pane:not(.pane-active) {
  filter: brightness(0.85);
  transition: filter 0.2s ease, box-shadow 0.2s ease;
}

.pane-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 14px;
  background: var(--canvas-bg, #1a1a2e);
}

.split-divider {
  width: 6px;
  cursor: col-resize;
  background: var(--border-color, #333);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 1;
  transition: background 0.15s;
}

.split-divider:hover,
.split-divider:active {
  background: var(--accent, #4a9eff);
}

.divider-grip {
  width: 2px;
  height: 32px;
  border-radius: 1px;
  background: var(--text-muted, #666);
  opacity: 0.5;
}

.split-divider:hover .divider-grip {
  opacity: 0;
}

</style>
