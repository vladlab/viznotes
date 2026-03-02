import { ref } from 'vue'
import type { Note } from '../types/note'
import type { CanvasTransform } from './useCanvas'
import { appStore } from '../stores/app'
import { history } from '../stores/history'

interface DraggedNote {
  note: Note
  startPos: { x: number; y: number }
  beforeSnapshot: Note  // for undo
}

export function useDrag(
  getTransform: () => CanvasTransform,
) {
  const isDragging = ref(false)
  const dragNote = ref<Note | null>(null)
  const dragParentId = ref<string | undefined>(undefined)
  const dragTargetId = ref<string | null>(null)
  const dropTargetId = ref<string | null>(null)

  const startClientPos = ref({ x: 0, y: 0 })
  const hasMoved = ref(false)

  let draggedNotes: DraggedNote[] = []
  let ghostEl: HTMLElement | null = null
  let originalEl: HTMLElement | null = null
  let isSpatialDrag = true
  let rafId: number | null = null
  let pendingEvent: PointerEvent | null = null

  const DRAG_THRESHOLD = 4

  let captureTarget: HTMLElement | null = null

  function cleanupDrag() {
    window.removeEventListener('pointermove', handleDragMove)
    window.removeEventListener('pointerup', handleDragEnd)
    if (captureTarget) {
      captureTarget.removeEventListener('lostpointercapture', handleLostCapture)
      captureTarget = null
    }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    pendingEvent = null
    removeGhost()
    isDragging.value = false
    dragNote.value = null
    dragTargetId.value = null
    dropTargetId.value = null
    hasMoved.value = false
    draggedNotes = []
    isSpatialDrag = true
    appStore.dragSessionNoteIds.clear()
    appStore.dropInsertParentId.value = null
    appStore.dropInsertIndex.value = -1
  }

  function startDrag(note: Note, parentNoteId: string | undefined, e: PointerEvent) {
    if (!note.movable) return

    // Kill any stuck drag from a previous interaction
    if (dragNote.value) cleanupDrag()

    isDragging.value = false
    dragNote.value = note
    dragParentId.value = parentNoteId
    dragTargetId.value = note.id
    hasMoved.value = false

    startClientPos.value = { x: e.clientX, y: e.clientY }

    originalEl = document.getElementById(`note-${note.id}`)
    // Children inside containers always use list (ghost) drag.
    // Only root-level canvas notes use spatial (position-based) drag.
    isSpatialDrag = !parentNoteId

    // Capture before snapshots for all notes that will move
    draggedNotes = []
    if (isSpatialDrag && appStore.selectedNoteIds.size > 1 && appStore.selectedNoteIds.has(note.id)) {
      for (const id of appStore.selectedNoteIds) {
        const n = appStore.notes.get(id)
        if (n) {
          draggedNotes.push({
            note: n,
            startPos: { x: n.pos.x, y: n.pos.y },
            beforeSnapshot: history.snapshotNote(appStore.notes, id)!,
          })
        }
      }
    } else {
      draggedNotes = [{
        note,
        startPos: { x: note.pos.x, y: note.pos.y },
        beforeSnapshot: history.snapshotNote(appStore.notes, note.id)!,
      }]
    }

    // Capture pointer to guarantee we receive move/up even if pointer leaves window
    captureTarget = e.target as HTMLElement
    try { captureTarget.setPointerCapture(e.pointerId) } catch {}
    captureTarget.addEventListener('lostpointercapture', handleLostCapture)

    // Track dragged notes for arrow rect caching (spatial drags only —
    // ghost drags don't move the real DOM element, so arrows stay put)
    appStore.dragSessionNoteIds.clear()
    if (isSpatialDrag) {
      for (const dn of draggedNotes) {
        appStore.dragSessionNoteIds.add(dn.note.id)
      }
    }

    window.addEventListener('pointermove', handleDragMove)
    window.addEventListener('pointerup', handleDragEnd)
  }

  function handleLostCapture() {
    // If we lose capture without a clean pointerup, force end the drag
    if (dragNote.value) {
      handleDragEnd(new PointerEvent('pointerup'))
    }
  }

  function handleDragMove(e: PointerEvent) {
    if (!dragNote.value) return

    // Threshold check happens immediately
    if (!hasMoved.value) {
      const dx = e.clientX - startClientPos.value.x
      const dy = e.clientY - startClientPos.value.y
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
      hasMoved.value = true
      isDragging.value = true

      if (!isSpatialDrag) {
        createGhost(e)
      }
    }

    // Batch position updates into animation frames
    pendingEvent = e
    if (!rafId) {
      rafId = requestAnimationFrame(processDragFrame)
    }
  }

  function processDragFrame() {
    rafId = null
    const e = pendingEvent
    if (!e || !dragNote.value) return

    const dx = e.clientX - startClientPos.value.x
    const dy = e.clientY - startClientPos.value.y

    if (isSpatialDrag) {
      const transform = getTransform()
      const worldDx = dx / transform.scale
      const worldDy = dy / transform.scale

      for (const dn of draggedNotes) {
        dn.note.pos.x = dn.startPos.x + worldDx
        dn.note.pos.y = dn.startPos.y + worldDy
      }

      // Trigger arrow recomputation (nextTick + rAF for guaranteed DOM read)
      appStore.triggerArrowRecompute()
    } else {
      if (ghostEl) {
        ghostEl.style.left = `${e.clientX}px`
        ghostEl.style.top = `${e.clientY}px`
      }
    }

    updateDropTarget(e)
  }

  function createGhost(e: PointerEvent) {
    if (!originalEl || !dragNote.value) return
    const rect = originalEl.getBoundingClientRect()

    ghostEl = originalEl.cloneNode(true) as HTMLElement
    ghostEl.id = 'drag-ghost'
    ghostEl.style.position = 'fixed'
    ghostEl.style.width = `${rect.width}px`
    ghostEl.style.height = `${rect.height}px`
    ghostEl.style.left = `${e.clientX}px`
    ghostEl.style.top = `${e.clientY}px`
    ghostEl.style.transform = 'translate(-50%, -50%)'
    ghostEl.style.zIndex = '100000'
    ghostEl.style.pointerEvents = 'none'
    ghostEl.style.opacity = '0.8'
    ghostEl.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)'
    ghostEl.style.borderRadius = '6px'
    document.body.appendChild(ghostEl)

    originalEl.style.opacity = '0.25'
  }

  function removeGhost() {
    if (ghostEl) { ghostEl.remove(); ghostEl = null }
    if (originalEl) { originalEl.style.opacity = ''; originalEl = null }
  }

  function updateDropTarget(e: PointerEvent) {
    if (!dragNote.value) return

    const hiddenEls: HTMLElement[] = []
    for (const dn of draggedNotes) {
      const el = document.getElementById(`note-${dn.note.id}`)
      if (el) { el.style.pointerEvents = 'none'; hiddenEls.push(el) }
    }
    if (ghostEl) ghostEl.style.pointerEvents = 'none'

    const elemUnder = document.elementFromPoint(e.clientX, e.clientY)
    for (const el of hiddenEls) el.style.pointerEvents = ''

    if (!elemUnder) {
      dropTargetId.value = null
      clearInsert()
      return
    }

    // Check if cursor is inside a container list → reorder detection
    const containerList = elemUnder.closest('.note-container-list')
    if (containerList) {
      const containerSection = containerList.closest('.note-container-section')
      const parentOuter = containerSection?.closest('.note-outer')
      if (parentOuter) {
        const parentId = parentOuter.id?.replace('note-', '')
        if (parentId) {
          const parentNote = appStore.notes.get(parentId)
          if (parentNote) {
            // Compute insertion index from cursor position relative to sibling centers
            // Filter out drop indicator elements to avoid feedback loops
            const isColumnsLayout = (parentNote.container.layout || 'list') === 'columns'
            const children = Array.from(containerList.children).filter(
              el => !el.classList.contains('container-drop-indicator') &&
                    !el.classList.contains('container-column-drop-indicator')
            ) as HTMLElement[]
            let insertIdx = children.length
            for (let i = 0; i < children.length; i++) {
              const childRect = children[i].getBoundingClientRect()
              if (isColumnsLayout) {
                // Columns: compare X positions
                const childCenter = childRect.left + childRect.width / 2
                if (e.clientX < childCenter) {
                  insertIdx = i
                  break
                }
              } else {
                // List: compare Y positions
                const childCenter = childRect.top + childRect.height / 2
                if (e.clientY < childCenter) {
                  insertIdx = i
                  break
                }
              }
            }

            // Map DOM index to childIds index (hidden dragged elements shift indices)
            // Actually, we hid pointer-events but didn't remove from DOM, so DOM order = childIds order
            // But the dragged note is still in the DOM (just invisible to hit-test)
            // We need the index in terms of childIds including the dragged note
            appStore.dropInsertParentId.value = parentId
            appStore.dropInsertIndex.value = insertIdx

            // If same parent, this is a reorder — don't set dropTargetId (that triggers reparent)
            if (parentId === dragParentId.value) {
              dropTargetId.value = null
              return
            } else {
              // Different container — reparent into it
              if (!isDescendantOfAny(parentId)) {
                dropTargetId.value = parentId
                return
              }
            }
          }
        }
      }
    }

    clearInsert()

    // Check if cursor is over a note with container → reparent target
    const noteOuter = elemUnder.closest('.note-outer')
    if (noteOuter) {
      const id = noteOuter.id?.replace('note-', '')
      if (id && !draggedNotes.some(dn => dn.note.id === id)) {
        const targetNote = appStore.notes.get(id)
        if (targetNote && targetNote.container.enabled && !isDescendantOfAny(id)) {
          dropTargetId.value = id
          return
        }
      }
    }
    dropTargetId.value = null
  }

  function clearInsert() {
    appStore.dropInsertParentId.value = null
    appStore.dropInsertIndex.value = -1
  }

  function isDescendantOfAny(potentialDescendantId: string): boolean {
    for (const dn of draggedNotes) {
      if (isDescendant(dn.note.id, potentialDescendantId)) return true
    }
    return false
  }

  function isDescendant(ancestorId: string, potentialDescendantId: string, visited = new Set<string>()): boolean {
    if (visited.has(ancestorId)) return false  // Cycle protection
    visited.add(ancestorId)
    const ancestor = appStore.notes.get(ancestorId)
    if (!ancestor?.container.enabled) return false
    for (const childId of ancestor.container.childIds) {
      if (childId === potentialDescendantId) return true
      if (isDescendant(childId, potentialDescendantId, visited)) return true
    }
    return false
  }

  async function handleDragEnd(e: PointerEvent) {
    const note = dragNote.value
    const parentId = dragParentId.value
    const targetId = dropTargetId.value
    const insertParentId = appStore.dropInsertParentId.value
    const insertIndex = appStore.dropInsertIndex.value
    const moved = hasMoved.value
    const savedDraggedNotes = [...draggedNotes]

    // Clean up all listeners and state immediately
    cleanupDrag()

    if (note && moved) {
      if (insertParentId && insertParentId === parentId && insertIndex >= 0) {
        // Reorder within the same container
        await appStore.reorderNote(note.id, parentId!, insertIndex)
      } else if (targetId) {
        // Reparent all dragged notes into the target container
        for (const dn of savedDraggedNotes) {
          const dnParentId = dn.note.id === note.id ? parentId : appStore.findParent(dn.note.id)
          await appStore.reparentNote(dn.note.id, dnParentId, targetId)
        }
      } else if (parentId) {
        // Unparent to canvas (records its own undo action)
        const transform = getTransform()
        const canvasEl = document.querySelector('.canvas-container')
        if (canvasEl) {
          const containerRect = canvasEl.getBoundingClientRect()
          const worldX = (e.clientX - containerRect.left - transform.x) / transform.scale
          const worldY = (e.clientY - containerRect.top - transform.y) / transform.scale
          await appStore.unparentNote(note.id, parentId, { x: worldX, y: worldY })
        }
      } else {
        // Normal move — push undo with before/after snapshots
        const movedNotes = savedDraggedNotes.map(dn => ({
          id: dn.note.id,
          before: dn.beforeSnapshot,
          after: history.snapshotNote(appStore.notes, dn.note.id)!,
        }))
        appStore.pushMoveAction(movedNotes)

        // Persist
        for (const dn of savedDraggedNotes) {
          appStore.markNoteDirty(dn.note, 100)
        }
      }
    }
  }

  return {
    isDragging,
    dragNote,
    dragTargetId,
    dropTargetId,
    startDrag,
    cancelDrag: cleanupDrag,
  }
}
