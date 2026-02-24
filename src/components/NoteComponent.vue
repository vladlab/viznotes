<template>
  <div
    :id="`note-${note.id}`"
    class="note-outer"
    :class="{
      collapsed: note.collapsed,
      'in-list': !spatial,
      'is-selected': isSelected,
      'is-editing': isEditing,
      'is-dragging': isDragTarget,
      'drop-target': isDropTarget,
      'file-note': isFileLink,
    }"
    :style="noteStyle"
    @pointerdown="onPointerDown"
    @dblclick.stop="onDoubleClick"
    @contextmenu.prevent.stop="showContextMenu"
  >
    <div class="note-frame" :class="{ 'has-collapse': hasMultipleSections }">
      <!-- Collapse toggle -->
      <button
        v-if="hasMultipleSections"
        class="collapse-toggle"
        :class="{ collapsed: note.collapsed }"
        @pointerdown.stop
        @click.stop="toggleCollapse"
        title="Toggle collapse"
      >
        <svg width="14" height="14" viewBox="0 0 10 10">
          <path
            :d="note.collapsed ? 'M3 1 L7 5 L3 9' : 'M1 3 L5 7 L9 3'"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <!-- Link icon — pointerdown.stop prevents note drag -->
      <div
        v-if="note.link"
        class="note-link-icon"
        :class="{ 'file-link': isFileLink }"
        @pointerdown.stop
        @click.stop="followLink"
        :title="linkTitle"
      >
        <!-- File icon for local paths -->
        <svg v-if="isFileLink" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <!-- External link icon for URLs / page links -->
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>

      <!-- Sections -->
      <NoteTextSection :note="note" sectionName="head" />

      <div v-if="note.head.enabled && (note.body.enabled || note.container.enabled) && !note.collapsed" class="note-divider" />

      <template v-if="!note.collapsed">
        <NoteTextSection :note="note" sectionName="body" />
        <div v-if="note.body.enabled && note.container.enabled" class="note-divider" />
        <NoteContainer :note="note" :depth="depth" />
      </template>
    </div>

    <!-- Resize handles (spatial, selected, not editing) -->
    <template v-if="spatial && note.resizable && isSelected && !isEditing">
      <div class="resize-handle resize-e" @pointerdown.stop="onResizeStart('e', $event)" />
      <div class="resize-handle resize-w" @pointerdown.stop="onResizeStart('w', $event)" />
      <div class="resize-handle resize-s" @pointerdown.stop="onResizeStart('s', $event)" />
      <div class="resize-handle resize-se" @pointerdown.stop="onResizeStart('se', $event)" />
    </template>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="contextMenuVisible"
        class="context-menu"
        :style="{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }"
        @pointerdown.stop
      >
        <button @click="toggleSection('body')">
          {{ note.body.enabled ? '✓ ' : '' }}Body
        </button>
        <button @click="toggleSection('container')">
          {{ note.container.enabled ? '✓ ' : '' }}Container
        </button>
        <div class="context-separator" />
        <button v-if="note.container.enabled" @click="toggleSpatial">
          {{ note.container.spatial ? '✓ ' : '' }}Spatial layout
        </button>
        <button v-if="note.container.enabled" @click="toggleHorizontal">
          {{ note.container.horizontal ? '✓ ' : '' }}Horizontal list
        </button>
        <div v-if="note.container.enabled" class="context-separator" />
        <div class="context-colors">
          <button
            v-for="name in NOTE_COLOR_NAMES"
            :key="name"
            class="color-swatch"
            :class="{ active: note.color.value === name }"
            :style="{ backgroundColor: `var(--note-${name})` }"
            @click="setColor(name as string)"
          />
        </div>
        <button v-if="note.width !== 'auto' || note.height !== 'auto'" @click="resetSize">Reset size</button>
        <div class="context-separator" />
        <template v-if="!isFileLink">
          <div class="context-submenu">
            <button @click="togglePagePicker" class="submenu-trigger">
              {{ note.link ? '✓ ' : '' }}Link to page ▸
            </button>
            <div v-if="pagePickerVisible" class="submenu-panel" @pointerdown.stop>
              <input
                type="text"
                class="submenu-search"
                v-model="pagePickerSearch"
                placeholder="Search pages…"
                spellcheck="false"
                ref="pagePickerInput"
              />
              <div class="submenu-list">
                <button
                  v-for="page in filteredAvailablePages"
                  :key="page.id"
                  :class="{ active: note.link === page.id }"
                  @click="setPageLink(page.id)"
                >
                  {{ page.title }}
                </button>
                <div v-if="filteredAvailablePages.length === 0" class="submenu-empty">
                  {{ availablePages.length === 0 ? 'No other pages' : 'No matches' }}
                </div>
              </div>
            </div>
          </div>
          <button @click="addUrlLink">
            {{ isUrlLink ? '✓ ' : '' }}Link to URL…
          </button>
        </template>
        <button v-if="note.link" @click="removeLink" class="danger">Remove link</button>
        <template v-if="isFileLink">
          <div class="context-separator" />
          <button @click="analyzeFile" :disabled="analyzing">
            {{ analyzing ? 'Analyzing…' : '🔍 Analyze media' }}
          </button>
        </template>
        <div class="context-separator" />
        <button v-if="!note.link" @click="convertToPage">Convert to page</button>
        <div class="context-separator" />
        <button class="danger" @click="onDelete">Delete note</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, inject } from 'vue'
import { showInFolder, isLocalPath, toFsPath, openExternal } from '../utils/platform'
import { NOTE_COLOR_NAMES, getNoteColor } from '../types/note'
import { appStore } from '../stores/app'
import { history } from '../stores/history'
import NoteTextSection from './NoteTextSection.vue'
import NoteContainer from './NoteContainer.vue'
import type { ResizeHandle } from '../composables/useResize'

const props = withDefaults(defineProps<{
  note: Note
  parentNoteId?: string
  depth?: number
  spatial?: boolean
}>(), {
  depth: 0,
  spatial: true,
})

// Injected from Canvas
const startDrag = inject<(note: Note, parentNoteId: string | undefined, e: PointerEvent) => void>('startDrag', () => {})
const startResize = inject<(note: Note, handle: ResizeHandle, e: PointerEvent) => void>('startResize', () => {})
const dragTargetId = inject<{ value: string | null }>('dragTargetId', ref(null))
const dropTargetId = inject<{ value: string | null }>('dropTargetId', ref(null))

const isEditing = computed(() => appStore.editingNoteId.value === props.note.id)
const isSelected = computed(() => appStore.selectedNoteIds.has(props.note.id))
const isDragTarget = computed(() => dragTargetId.value === props.note.id)
const isDropTarget = computed(() => dropTargetId.value === props.note.id)

// Context menu
const contextMenuVisible = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })

const hasMultipleSections = computed(() => {
  let count = 0
  if (props.note.head.enabled) count++
  if (props.note.body.enabled) count++
  if (props.note.container.enabled) count++
  return count > 1
})

const noteColor = computed(() => {
  if (props.note.color.inherit) return undefined
  return getNoteColor(props.note.color.value)
})

const noteStyle = computed(() => {
  const style: Record<string, string> = {}

  if (props.spatial) {
    style.position = 'absolute'
    style.left = '0'
    style.top = '0'
    style.transform = `translate(${props.note.pos.x}px, ${props.note.pos.y}px)`
    style.zIndex = `${props.note.zIndex}`
    style.willChange = isDragTarget.value ? 'transform' : 'auto'
  }

  if (props.note.width && props.note.width !== 'auto') {
    style.width = `${props.note.width}px`
  } else if (props.spatial) {
    style.width = 'max-content'
    style.minWidth = '120px'
    style.maxWidth = '500px'
  }

  if (props.note.height && props.note.height !== 'auto') {
    style.height = `${props.note.height}px`
  }

  if (noteColor.value) {
    style['--note-color'] = noteColor.value
    style['--note-bg'] = noteColor.value + '30'
    style['--note-border'] = noteColor.value + 'aa'
  }

  return style
})

function onPointerDown(e: PointerEvent) {
  // Middle click: let it bubble up to canvas for panning
  if (e.button === 1) return

  if (e.button !== 0) return
  e.stopPropagation()

  // If this note is being edited, let Tiptap handle events (text selection etc.)
  if (isEditing.value) return

  // Exit any other note's editing
  if (appStore.editingNoteId.value) {
    appStore.clearEditing()
  }

  // Selection logic (following selection pattern)
  const isCtrl = e.ctrlKey || e.metaKey

  if (isCtrl) {
    // Ctrl+click: toggle selection
    appStore.toggleNoteSelection(props.note.id)
  } else if (!isSelected.value) {
    // Click on unselected: select it (clear others)
    appStore.selectNote(props.note.id, false)
  }
  // If already selected without Ctrl: keep selection, just drag

  // Start drag if the note is now selected
  if (appStore.isSelected(props.note.id)) {
    e.preventDefault()
    startDrag(props.note, props.parentNoteId, e)
  }
}

function onDoubleClick(e: MouseEvent) {
  if (isEditing.value) return
  appStore.setEditingNote(props.note.id)
}

function onResizeStart(handle: ResizeHandle, e: PointerEvent) {
  startResize(props.note, handle, e)
}

function toggleCollapse() {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.collapsed = !props.note.collapsed
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Toggle collapse')
}

function showContextMenu(e: MouseEvent) {
  if (!isSelected.value) {
    appStore.selectNote(props.note.id, false)
  }

  contextMenuPos.value = { x: e.clientX, y: e.clientY }
  contextMenuVisible.value = true
  pagePickerVisible.value = false

  const close = (ev: Event) => {
    // Don't close if interacting with elements inside the context menu (except Escape)
    if (ev instanceof KeyboardEvent && ev.key !== 'Escape') {
      const menu = document.querySelector('.context-menu')
      if (menu && ev.target instanceof Node && menu.contains(ev.target)) return
    }
    // Don't close on pointerdown inside the context menu itself
    if (ev.type === 'pointerdown') {
      const menu = document.querySelector('.context-menu')
      if (menu && ev.target instanceof Node && menu.contains(ev.target)) return
    }

    contextMenuVisible.value = false
    pagePickerVisible.value = false
    window.removeEventListener('pointerdown', close, true)
    window.removeEventListener('keydown', close)
  }
  setTimeout(() => {
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close)
  }, 0)
}

function toggleSection(section: 'body' | 'container') {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note[section].enabled = !props.note[section].enabled
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, `Toggle ${section}`)
  contextMenuVisible.value = false
}

function toggleSpatial() {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.container.spatial = !props.note.container.spatial
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Toggle spatial')
  contextMenuVisible.value = false
}

function toggleHorizontal() {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.container.horizontal = !props.note.container.horizontal
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Toggle horizontal')
  contextMenuVisible.value = false
}

function setColor(color: string) {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.color.value = color
  props.note.color.inherit = false
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Change color')
  contextMenuVisible.value = false
}

function resetSize() {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.width = 'auto'
  props.note.height = 'auto'
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Reset size')
  contextMenuVisible.value = false
}

// Page picker
const pagePickerVisible = ref(false)
const pagePickerSearch = ref('')
const pagePickerInput = ref<HTMLInputElement | null>(null)

const availablePages = computed(() => {
  return appStore.pageList.value.filter(p => p.id !== appStore.currentPageId.value)
})

const filteredAvailablePages = computed(() => {
  const q = pagePickerSearch.value.toLowerCase().trim()
  if (!q) return availablePages.value
  return availablePages.value.filter(p =>
    (p.title || 'Untitled').toLowerCase().includes(q)
  )
})

const isUrlLink = computed(() => {
  if (!props.note.link) return false
  return props.note.link.includes('://') || props.note.link.startsWith('/') || /^[A-Z]:[\\\/]/.test(props.note.link)
})

const isFileLink = computed(() => {
  return isUrlLink.value && isLocalPath(props.note.link)
})

const linkTitle = computed(() => {
  if (!props.note.link) return ''
  if (isFileLink.value) return `Open folder: ${props.note.link}`
  if (isUrlLink.value) return `Open: ${props.note.link}`
  const page = appStore.pageList.value.find(p => p.id === props.note.link)
  return page ? `Go to: ${page.title}` : `Go to page`
})

function togglePagePicker() {
  pagePickerVisible.value = !pagePickerVisible.value
  if (pagePickerVisible.value) {
    pagePickerSearch.value = ''
    setTimeout(() => pagePickerInput.value?.focus(), 0)
  }
}

function setPageLink(pageId: string) {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  if (props.note.link === pageId) {
    props.note.link = ''
  } else {
    props.note.link = pageId
  }
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Set page link')
  contextMenuVisible.value = false
  pagePickerVisible.value = false
}

function addUrlLink() {
  const url = prompt('Enter URL:', isUrlLink.value ? props.note.link : 'https://')
  if (url !== null && url.trim()) {
    const before = history.snapshotNote(appStore.notes, props.note.id)!
    props.note.link = url.trim()
    appStore.updateNote(props.note)
    appStore.pushNotePropertyAction(props.note.id, before, 'Set URL link')
  }
  contextMenuVisible.value = false
}

function removeLink() {
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.link = ''
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Remove link')
  contextMenuVisible.value = false
}

function extractText(content: any): string {
  if (!content) return ''
  if (content.text) return content.text
  if (Array.isArray(content.content)) {
    return content.content.map(extractText).join(' ')
  }
  return ''
}

async function convertToPage() {
  contextMenuVisible.value = false

  // Extract title from head section text
  const headText = extractText(props.note.head.content).trim()
  const title = headText || 'Untitled'

  // Create a new page
  const page = await appStore.createPage(title)

  // Link this note to the new page
  const before = history.snapshotNote(appStore.notes, props.note.id)!
  props.note.link = page.id
  appStore.updateNote(props.note)
  appStore.pushNotePropertyAction(props.note.id, before, 'Convert to page')

  // Navigate to the new page (push history so breadcrumbs work)
  await appStore.navigateToPage(page.id, true)
}

async function followLink() {
  if (!props.note.link) return

  if (isFileLink.value) {
    // Local path — open containing folder (desktop)
    const fsPath = toFsPath(props.note.link)
    const opened = await showInFolder(fsPath)
    if (!opened) {
      // Not in desktop app — copy path to clipboard as fallback
      try {
        await navigator.clipboard.writeText(fsPath)
        // Could show a toast here
      } catch {}
    }
  } else if (isUrlLink.value) {
    await openExternal(props.note.link)
  } else {
    appStore.navigateToPage(props.note.link)
  }
}

function onDelete() {
  contextMenuVisible.value = false
  appStore.deleteNote(props.note.id, props.parentNoteId)
}

const analyzing = ref(false)

async function analyzeFile() {
  if (!isFileLink.value || analyzing.value) return
  analyzing.value = true
  contextMenuVisible.value = false

  try {
    const { invoke } = await import('@tauri-apps/api/core')

    // Check file exists first
    const exists: boolean = await invoke('path_exists', { path: props.note.link })
    if (!exists) {
      const before = history.snapshotNote(appStore.notes, props.note.id)!
      props.note.body.enabled = true
      props.note.collapsed = false
      const existingBlocks = props.note.body.content?.content || []
      existingBlocks.push({
        type: 'paragraph',
        content: [{ type: 'text', text: '⚠ File not found — may have been moved or deleted' }],
      })
      props.note.body.content = { type: 'doc', content: existingBlocks }
      appStore.updateNote(props.note)
      appStore.pushNotePropertyAction(props.note.id, before, 'Analyze media')
      analyzing.value = false
      return
    }

    const result = await invoke<string>('run_ffprobe', {
      path: props.note.link,
      args: [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
      ],
    })

    const probe = JSON.parse(result.trim())
    const streams: any[] = probe.streams || []
    const format = probe.format || {}

    const lines: string[] = []

    // File size
    const bytes = parseInt(format.size || '0', 10)
    if (bytes > 0) {
      lines.push(`Size: ${formatFileSize(bytes)}`)
    }

    // Find first video and audio streams
    const videoStream = streams.find((s: any) => s.codec_type === 'video' && s.codec_name !== 'mjpeg')
    const audioStreams = streams.filter((s: any) => s.codec_type === 'audio')
    const dataStreams = streams.filter((s: any) => s.codec_type === 'data' || s.codec_type === 'subtitle')

    // Video codec
    if (videoStream) {
      const res = videoStream.width && videoStream.height ? ` (${videoStream.width}×${videoStream.height})` : ''
      lines.push(`Video: ${videoStream.codec_name}${res}`)
    }

    // Audio codec (first stream's codec as summary)
    if (audioStreams.length > 0) {
      lines.push(`Audio: ${audioStreams[0].codec_name}`)
    }

    // Start timecode — check format tags, then video stream tags
    const startTc = format.tags?.timecode
      || videoStream?.tags?.timecode
      || streams.find((s: any) => s.codec_type === 'data' && s.tags?.timecode)?.tags?.timecode
    if (startTc) {
      lines.push(`Start TC: ${startTc}`)
    }

    // Framerate
    if (videoStream) {
      const fps = parseFrameRate(videoStream.r_frame_rate || videoStream.avg_frame_rate)
      if (fps) lines.push(`FPS: ${fps}`)
    }

    // Audio track list
    if (audioStreams.length > 0) {
      lines.push('')
      lines.push(`Audio tracks (${audioStreams.length}):`)
      for (let i = 0; i < audioStreams.length; i++) {
        const a = audioStreams[i]
        const layout = describeAudioLayout(a)
        const lang = a.tags?.language && a.tags.language !== 'und' ? ` [${a.tags.language}]` : ''
        const title = a.tags?.title ? ` — ${a.tags.title}` : ''
        lines.push(`  ${i + 1}. ${a.codec_name} ${layout}${lang}${title}`)
      }
    }

    // Data/metadata tracks
    if (dataStreams.length > 0) {
      lines.push('')
      lines.push(`Metadata tracks (${dataStreams.length}):`)
      for (let i = 0; i < dataStreams.length; i++) {
        const d = dataStreams[i]
        const name = d.tags?.handler_name || d.codec_tag_string || d.codec_name || 'unknown'
        const tc = d.tags?.timecode ? ` (TC: ${d.tags.timecode})` : ''
        lines.push(`  ${i + 1}. ${name}${tc}`)
      }
    }

    if (lines.length === 0) {
      lines.push('No media streams found')
    }

    const before = history.snapshotNote(appStore.notes, props.note.id)!

    props.note.body.enabled = true
    props.note.collapsed = false

    // Append to existing body content
    const existingBlocks = props.note.body.content?.content || []
    const newBlocks = lines.map(line => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    }))

    props.note.body.content = {
      type: 'doc',
      content: [...existingBlocks, ...newBlocks],
    }

    appStore.updateNote(props.note)
    appStore.pushNotePropertyAction(props.note.id, before, 'Analyze media')
  } catch (e: any) {
    console.error('ffprobe failed:', e)
    // Show error in the note body
    try {
      const before = history.snapshotNote(appStore.notes, props.note.id)!
      props.note.body.enabled = true
      props.note.collapsed = false
      const existingBlocks = props.note.body.content?.content || []
      const msg = String(e).includes('ffprobe') ? '⚠ ffprobe not found — is FFmpeg installed?' : `⚠ Analysis failed: ${e}`
      existingBlocks.push({
        type: 'paragraph',
        content: [{ type: 'text', text: msg }],
      })
      props.note.body.content = { type: 'doc', content: existingBlocks }
      appStore.updateNote(props.note)
      appStore.pushNotePropertyAction(props.note.id, before, 'Analyze media')
    } catch { /* ignore */ }
  }
  analyzing.value = false
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

function parseFrameRate(rateStr: string): string | null {
  if (!rateStr) return null
  const parts = rateStr.split('/')
  if (parts.length === 2) {
    const num = parseInt(parts[0], 10)
    const den = parseInt(parts[1], 10)
    if (den === 0) return null
    const fps = num / den
    // Show common NTSC rates nicely
    const rounded2 = Math.round(fps * 100) / 100
    if (Math.abs(fps - Math.round(fps)) < 0.01) return `${Math.round(fps)}`
    return `${rounded2}`
  }
  return rateStr
}

function describeAudioLayout(stream: any): string {
  const layout = stream.channel_layout
  if (layout) {
    const map: Record<string, string> = {
      'mono': 'Mono',
      'stereo': 'Stereo',
      '5.1': '5.1',
      '5.1(side)': '5.1',
      '7.1': '7.1',
      '7.1(wide)': '7.1',
      'quad': 'Quad',
    }
    return map[layout] || layout
  }
  const ch = stream.channels
  if (ch === 1) return 'Mono'
  if (ch === 2) return 'Stereo'
  if (ch === 6) return '5.1'
  if (ch === 8) return '7.1'
  if (ch) return `${ch}ch`
  return ''
}

function extractPlainText(content: any): string {
  if (!content?.content) return ''
  return content.content
    .map((block: any) => {
      if (!block.content) return ''
      return block.content.map((node: any) => node.text || '').join('')
    })
    .filter((s: string) => s.length > 0)
    .join('\n')
}
</script>

<style>
.note-outer {
  --note-color: var(--note-default-color);
  --note-bg: color-mix(in srgb, var(--note-default-color) 15%, transparent);
  --note-border: color-mix(in srgb, var(--note-default-color) 60%, transparent);

  position: relative;
  min-width: 80px;
  cursor: grab;
  user-select: none;
  contain: layout style;
}

.note-outer:active:not(.is-editing) {
  cursor: grabbing;
}

.note-outer.is-editing {
  cursor: auto;
  user-select: auto;
}

.note-outer.is-dragging {
  opacity: 0.7;
  z-index: 99999 !important;
}

.note-outer.drop-target > .note-frame {
  box-shadow: 0 0 0 2px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 30%, transparent);
}

/* File reference note — green left accent */
.note-outer.file-note > .note-frame {
  border-left: 3px solid rgba(76, 175, 80, 0.5);
}

.note-outer.in-list {
  position: relative;
  cursor: grab;
}

.note-outer.in-list.is-editing {
  cursor: auto;
}

.note-frame {
  background: var(--note-bg);
  border: 1.5px solid var(--note-border);
  border-radius: 6px;
  color: var(--text-primary);
  overflow: clip;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.note-outer:hover:not(.is-selected) > .note-frame {
  box-shadow: 0 0 0 1px var(--note-color);
}

/* Selected state: blue highlight */
.note-outer.is-selected > .note-frame {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

/* Editing state: stronger blue */
.note-outer.is-editing > .note-frame {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent);
}

.note-divider {
  height: 1px;
  background: var(--note-border);
  margin: 0;
  flex-shrink: 0;
}

/* When collapse button visible, indent content so arrow doesn't overlap text */
.note-frame.has-collapse > .note-text-section {
  padding-left: 24px;
}

/* Collapse toggle */
.collapse-toggle {
  position: absolute;
  top: 3px;
  left: 2px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0;
  border-radius: 3px;
  z-index: 10;
}

.collapse-toggle:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

/* Link icon */
.note-link-icon {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-text);
  cursor: pointer;
  z-index: 10;
  border-radius: 4px;
  background: rgba(33, 150, 243, 0.15);
  transition: background 0.15s ease, color 0.15s ease;
}

.note-link-icon:hover {
  background: rgba(33, 150, 243, 0.3);
  color: var(--accent-text);
}

.note-link-icon.file-link {
  color: var(--file-accent);
  background: rgba(76, 175, 80, 0.15);
}

.note-link-icon.file-link:hover {
  background: rgba(76, 175, 80, 0.3);
  color: var(--file-accent-light);
}

/* Context menu submenu */
.context-submenu {
  position: relative;
}

.submenu-trigger {
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

.submenu-trigger:hover {
  background: var(--bg-surface-hover);
}

.submenu-panel {
  position: absolute;
  left: 100%;
  top: 0;
  min-width: 200px;
  max-width: 280px;
  background: var(--controls-bg);
  border: 1px solid var(--border-main);
  border-radius: 8px;
  padding: 4px;
  box-shadow: var(--shadow-menu);
  z-index: 10001;
}

.submenu-search {
  width: calc(100% - 8px);
  margin: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  color: var(--text-secondary);
  padding: 5px 8px;
  font-size: 0.8em;
  border-radius: 4px;
  outline: none;
}

.submenu-search:focus {
  border-color: var(--border-input-focus);
}

.submenu-search::placeholder {
  color: var(--text-faint);
}

.submenu-list {
  max-height: 200px;
  overflow-y: auto;
}

.submenu-panel button {
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.submenu-panel button:hover {
  background: var(--bg-surface-hover);
}

.submenu-panel button.active {
  color: var(--accent);
}

.submenu-empty {
  padding: 6px 12px;
  font-size: 0.82em;
  color: var(--text-faint);
  font-style: italic;
}

/* Resize handles */
.resize-handle {
  position: absolute;
  z-index: 20;
}

.resize-e {
  right: -4px;
  top: 4px;
  bottom: 4px;
  width: 8px;
  cursor: ew-resize;
}

.resize-w {
  left: -4px;
  top: 4px;
  bottom: 4px;
  width: 8px;
  cursor: ew-resize;
}

.resize-s {
  bottom: -4px;
  left: 4px;
  right: 4px;
  height: 8px;
  cursor: ns-resize;
}

.resize-se {
  right: -4px;
  bottom: -4px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}

/* Context menu */
.context-menu {
  position: fixed;
  z-index: 10000;
  background: var(--controls-bg);
  border: 1px solid var(--border-main);
  border-radius: 8px;
  padding: 4px;
  min-width: 180px;
  box-shadow: var(--shadow-menu);
}

.context-menu button {
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

.context-menu button:hover {
  background: var(--bg-surface-hover);
}

.context-menu button.danger {
  color: var(--danger);
}

.context-separator {
  height: 1px;
  background: var(--border-main);
  margin: 4px 8px;
}

.context-colors {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  flex-wrap: wrap;
}

.color-swatch {
  width: 20px !important;
  height: 20px !important;
  min-width: 20px;
  border-radius: 50% !important;
  padding: 0 !important;
  border: 2px solid transparent !important;
  cursor: pointer;
}

.color-swatch.active {
  border-color: white !important;
}

.color-swatch:hover {
  transform: scale(1.2);
}
</style>
