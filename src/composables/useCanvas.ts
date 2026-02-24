import { reactive, ref, computed, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { settings } from '../stores/settings'

export interface CanvasTransform {
  x: number
  y: number
  scale: number
}

export function useCanvas(containerRef: Ref<HTMLElement | null>) {
  const transform = reactive<CanvasTransform>({
    x: 0,
    y: 0,
    scale: 1,
  })

  const isPanning = ref(false)
  const panStart = reactive({ x: 0, y: 0 })

  const MIN_SCALE = 0.1
  const MAX_SCALE = 3

  // Convert client (screen) coordinates to world (canvas) coordinates
  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const container = containerRef.value
    if (!container) return { x: clientX, y: clientY }

    const rect = container.getBoundingClientRect()
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale,
    }
  }

  // Convert world coordinates to client coordinates
  function worldToClient(worldX: number, worldY: number): { x: number; y: number } {
    const container = containerRef.value
    if (!container) return { x: worldX, y: worldY }

    const rect = container.getBoundingClientRect()
    return {
      x: worldX * transform.scale + transform.x + rect.left,
      y: worldY * transform.scale + transform.y + rect.top,
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault()

    // Determine if this scroll event should zoom
    const forceZoom = e.ctrlKey || e.metaKey
    const shouldZoom = forceZoom || settings.scrollMode === 'mouse'

    if (shouldZoom) {
      // Multiplicative zoom: each scroll tick scales by a fixed factor
      // 0.999^100 ≈ 0.9 — so one mouse wheel tick = ~10% zoom change
      // Touchpad gives smaller deltaY values = finer control
      const zoomFactor = Math.pow(0.999, e.deltaY)
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * zoomFactor))

      // Zoom toward cursor position
      const container = containerRef.value
      if (container) {
        const rect = container.getBoundingClientRect()
        const cursorX = e.clientX - rect.left
        const cursorY = e.clientY - rect.top

        const scaleRatio = newScale / transform.scale
        transform.x = cursorX - (cursorX - transform.x) * scaleRatio
        transform.y = cursorY - (cursorY - transform.y) * scaleRatio
      }

      transform.scale = newScale
    } else {
      // Pan
      transform.x -= e.deltaX
      transform.y -= e.deltaY
    }
  }

  function handleMiddleMouseDown(e: MouseEvent) {
    if (e.button === 1) {
      // Middle mouse button
      e.preventDefault()
      isPanning.value = true
      panStart.x = e.clientX - transform.x
      panStart.y = e.clientY - transform.y
    }
  }

  function handlePointerDown(e: PointerEvent) {
    // Middle mouse button pans
    if (e.button === 1) {
      e.preventDefault()
      isPanning.value = true
      panStart.x = e.clientX - transform.x
      panStart.y = e.clientY - transform.y
      ;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (isPanning.value) {
      transform.x = e.clientX - panStart.x
      transform.y = e.clientY - panStart.y
    }
  }

  function handlePointerUp(e: PointerEvent) {
    isPanning.value = false
  }

  function resetView() {
    transform.x = 0
    transform.y = 0
    transform.scale = 1
  }

  function zoomIn() {
    const newScale = Math.min(MAX_SCALE, transform.scale * 1.2)
    const container = containerRef.value
    if (container) {
      const rect = container.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      const scaleRatio = newScale / transform.scale
      transform.x = cx - (cx - transform.x) * scaleRatio
      transform.y = cy - (cy - transform.y) * scaleRatio
    }
    transform.scale = newScale
  }

  function zoomOut() {
    const newScale = Math.max(MIN_SCALE, transform.scale / 1.2)
    const container = containerRef.value
    if (container) {
      const rect = container.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      const scaleRatio = newScale / transform.scale
      transform.x = cx - (cx - transform.x) * scaleRatio
      transform.y = cy - (cy - transform.y) * scaleRatio
    }
    transform.scale = newScale
  }

  const transformCSS = computed(() =>
    `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
  )

  return {
    transform,
    isPanning,
    transformCSS,
    clientToWorld,
    worldToClient,
    handleWheel,
    handleMiddleMouseDown,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetView,
    zoomIn,
    zoomOut,
  }
}
