import { ref } from 'vue'
import type { Note } from '../types/note'
import type { CanvasTransform } from './useCanvas'
import { appStore } from '../stores/app'
import { history } from '../stores/history'

export type ResizeHandle = 'e' | 'w' | 'se' | 'sw' | 's'

export function useResize(
  getTransform: () => CanvasTransform,
) {
  const isResizing = ref(false)
  const resizeNote = ref<Note | null>(null)
  const resizeHandle = ref<ResizeHandle>('se')
  const startClientPos = ref({ x: 0, y: 0 })
  const startWidth = ref(0)
  const startHeight = ref(0)
  const startNotePos = ref({ x: 0, y: 0 })

  let beforeSnapshot: Note | null = null

  function startResize(note: Note, handle: ResizeHandle, e: PointerEvent) {
    if (!note.resizable) return

    e.stopPropagation()
    e.preventDefault()

    isResizing.value = true
    resizeNote.value = note
    resizeHandle.value = handle

    startClientPos.value = { x: e.clientX, y: e.clientY }
    startNotePos.value = { ...note.pos }

    const noteEl = document.getElementById(`note-${note.id}`)
    startWidth.value = noteEl?.offsetWidth ?? 200
    startHeight.value = noteEl?.offsetHeight ?? 100

    // Capture before snapshot for undo
    beforeSnapshot = history.snapshotNote(appStore.notes, note.id)

    window.addEventListener('pointermove', handleResizeMove)
    window.addEventListener('pointerup', handleResizeEnd)
  }

  function handleResizeMove(e: PointerEvent) {
    if (!isResizing.value || !resizeNote.value) return

    const transform = getTransform()
    const dx = (e.clientX - startClientPos.value.x) / transform.scale
    const dy = (e.clientY - startClientPos.value.y) / transform.scale
    const handle = resizeHandle.value
    const note = resizeNote.value

    if (handle.includes('e')) {
      note.width = `${Math.round(Math.max(80, startWidth.value + dx))}`
    }
    if (handle.includes('w')) {
      note.width = `${Math.round(Math.max(80, startWidth.value - dx))}`
      note.pos.x = startNotePos.value.x + dx
    }
    if (handle.includes('s')) {
      note.height = `${Math.round(Math.max(40, startHeight.value + dy))}`
    }

    appStore.triggerArrowRecompute()
  }

  function handleResizeEnd(e: PointerEvent) {
    if (resizeNote.value && isResizing.value && beforeSnapshot) {
      const afterSnapshot = history.snapshotNote(appStore.notes, resizeNote.value.id)!
      appStore.pushResizeAction(resizeNote.value.id, beforeSnapshot, afterSnapshot)
      appStore.debouncedSaveNote(resizeNote.value, 100)
    }

    isResizing.value = false
    resizeNote.value = null
    beforeSnapshot = null

    window.removeEventListener('pointermove', handleResizeMove)
    window.removeEventListener('pointerup', handleResizeEnd)
  }

  return {
    isResizing,
    resizeNote,
    startResize,
  }
}
