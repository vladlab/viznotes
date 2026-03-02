/**
 * Generators for structured note layouts.
 * Creates pre-configured note hierarchies like week views.
 */

import type { Note } from '../types/note'
import { history } from './history'
import {
  notes,
  currentPage,
  selectedNoteIds,
  selectedArrowIds,
  selectionArray,
  getRootIds,
  deepClone,
  getStorage,
  setParent,
  markNoteDirty,
  markPageDirty,
} from './state'
import { createDefaultNote } from '../types/note'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Day colors — subtle visual distinction per day
const DAY_COLORS = ['blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'purple']

/**
 * Get the Monday of the week containing the given date (ISO weeks start Monday).
 */
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // getDay(): 0=Sun, 1=Mon ... 6=Sat → shift so Mon=0
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Format a day label: "Mon 3/17"
 */
function dayLabel(date: Date, dayIndex: number): string {
  return `${DAY_NAMES[dayIndex]} ${date.getMonth() + 1}/${date.getDate()}`
}

/**
 * Format a week title: "Week of Mar 17, 2025"
 */
function weekTitle(monday: Date): string {
  return `Week of ${MONTH_NAMES[monday.getMonth()]} ${monday.getDate()}, ${monday.getFullYear()}`
}

function makeHeadContent(text: string, bold = false): any {
  const textNode: any = { type: 'text', text }
  if (bold) textNode.marks = [{ type: 'bold' }]
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [textNode] }],
  }
}

/**
 * Generate a week view: a columns-container with 7 day columns.
 * Each day column is a list-container ready to hold notes.
 *
 * @param pos - Canvas position for the week container
 * @param targetDate - Any date within the desired week (defaults to today)
 * @returns The root week container note
 */
export async function generateWeek(
  pos: { x: number; y: number },
  targetDate: Date = new Date(),
): Promise<Note | null> {
  if (!currentPage.value) return null

  const storage = getStorage()
  const selBefore = selectionArray()
  const rootIdsBefore = getRootIds()
  const monday = getMonday(targetDate)

  // Create the root week container
  const weekNote = createDefaultNote(currentPage.value.id, pos)
  weekNote.zIndex = currentPage.value.nextZIndex++
  weekNote.head.content = makeHeadContent(weekTitle(monday), true)
  weekNote.container.enabled = true
  weekNote.container.layout = 'columns'
  weekNote.width = '1100'
  weekNote.color = { inherit: false, value: 'grey' }
  weekNote.nodeType = 'default'

  const savedWeek = await storage.saveNote(weekNote)
  notes.set(savedWeek.id, savedWeek)

  // Create 7 day columns
  const dayNotes: Note[] = []
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(monday)
    dayDate.setDate(monday.getDate() + i)

    const dayNote = createDefaultNote(currentPage.value.id, { x: 0, y: 0 })
    dayNote.zIndex = currentPage.value.nextZIndex++
    dayNote.head.content = makeHeadContent(dayLabel(dayDate, i))
    dayNote.head.wrap = false
    dayNote.container.enabled = true
    dayNote.container.layout = 'list'
    dayNote.color = { inherit: false, value: DAY_COLORS[i] }

    const savedDay = await storage.saveNote(dayNote)
    notes.set(savedDay.id, savedDay)
    dayNotes.push(savedDay)

    savedWeek.container.childIds.push(savedDay.id)
    setParent(savedDay.id, savedWeek.id)
  }

  // Add week to page
  currentPage.value.rootNoteIds.push(savedWeek.id)

  // Persist everything
  await storage.saveNote(savedWeek)
  await storage.savePage(currentPage.value)

  // Build undo action
  const notesAfter: Record<string, Note | null> = {
    [savedWeek.id]: deepClone(savedWeek),
  }
  const notesBefore: Record<string, Note | null> = {
    [savedWeek.id]: null,
  }
  for (const day of dayNotes) {
    notesAfter[day.id] = deepClone(day)
    notesBefore[day.id] = null
  }

  history.pushAction({
    description: 'Generate week view',
    notesBefore,
    notesAfter,
    rootIdsBefore,
    rootIdsAfter: getRootIds(),
    selectionBefore: selBefore,
    selectionAfter: [savedWeek.id],
  })

  // Select the new week
  selectedNoteIds.clear()
  selectedArrowIds.clear()
  selectedNoteIds.add(savedWeek.id)

  return savedWeek
}
