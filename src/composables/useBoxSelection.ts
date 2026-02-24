import { ref, computed, reactive } from 'vue'
import { appStore } from '../stores/app'

export function useBoxSelection() {
  const active = ref(false)
  const startPos = reactive({ x: 0, y: 0 })
  const endPos = reactive({ x: 0, y: 0 })

  let hasDragged = false
  const DRAG_THRESHOLD = 5

  const displayRect = computed(() => {
    if (!active.value) return null
    return {
      left: Math.min(startPos.x, endPos.x),
      top: Math.min(startPos.y, endPos.y),
      width: Math.abs(endPos.x - startPos.x),
      height: Math.abs(endPos.y - startPos.y),
    }
  })

  function start(e: PointerEvent) {
    startPos.x = e.clientX
    startPos.y = e.clientY
    endPos.x = e.clientX
    endPos.y = e.clientY
    hasDragged = false
    active.value = false

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
  }

  function onMove(e: PointerEvent) {
    const dx = e.clientX - startPos.x
    const dy = e.clientY - startPos.y

    if (!hasDragged) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
      hasDragged = true
      active.value = true
    }

    endPos.x = e.clientX
    endPos.y = e.clientY
  }

  function onEnd(e: PointerEvent) {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)

    if (!hasDragged) {
      active.value = false
      return
    }

    // Compute the selection box in client coords
    const boxLeft = Math.min(startPos.x, endPos.x)
    const boxTop = Math.min(startPos.y, endPos.y)
    const boxRight = Math.max(startPos.x, endPos.x)
    const boxBottom = Math.max(startPos.y, endPos.y)

    const isAdditive = e.shiftKey || e.ctrlKey || e.metaKey

    if (!isAdditive) {
      appStore.clearSelection()
    }

    // Check all root notes for intersection
    if (appStore.currentPage.value) {
      for (const noteId of appStore.currentPage.value.rootNoteIds) {
        const el = document.getElementById(`note-${noteId}`)
        if (!el) continue

        const rect = el.getBoundingClientRect()

        // Check intersection (not containment — partial overlap counts)
        if (
          rect.right >= boxLeft &&
          rect.left <= boxRight &&
          rect.bottom >= boxTop &&
          rect.top <= boxBottom
        ) {
          if (isAdditive && appStore.selectedNoteIds.has(noteId)) {
            appStore.selectedNoteIds.delete(noteId)
          } else {
            appStore.selectedNoteIds.add(noteId)
          }
        }
      }
    }

    active.value = false
  }

  return {
    active,
    displayRect,
    start,
  }
}
