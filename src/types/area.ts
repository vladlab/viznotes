export interface Area {
  id: string
  pageId: string
  title: string
  pos: { x: number; y: number }
  width: number
  height: number
  color: string   // CSS color name or hex
  jumpNumber: number  // 0 = unassigned, 1-9 = keyboard shortcut
  createdAt: number
  updatedAt: number
}

export function createDefaultArea(
  pageId: string,
  pos: { x: number; y: number },
  overrides: Partial<Area> = {}
): Area {
  return {
    id: '',
    pageId,
    title: '',
    pos,
    width: 600,
    height: 400,
    color: '#3b82f6',
    jumpNumber: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

export const AREA_COLORS: { name: string; value: string }[] = [
  { name: 'Blue',   value: '#3b82f6' },
  { name: 'Green',  value: '#22c55e' },
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Red',    value: '#ef4444' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Cyan',   value: '#06b6d4' },
  { name: 'Pink',   value: '#ec4899' },
  { name: 'Grey',   value: '#6b7280' },
]
