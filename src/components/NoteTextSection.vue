<template>
  <div
    v-if="sectionName === 'autoBody' || section.enabled"
    class="note-text-section"
    :class="[
      `note-${sectionName}`,
      { 'no-wrap': !section.wrap, 'is-editing': isEditing }
    ]"
    :style="sectionStyle"
  >
    <editor-content
      v-if="editor"
      :editor="editor"
      class="note-editor"
      @focusin="onFocusIn"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { Markdown } from 'tiptap-markdown'
import { TiptapImage } from '../extensions/TiptapImage'
import { TrailingParagraph } from '../extensions/TrailingParagraph'
import { saveImageAsset } from '../utils/assets'
import { getStorage } from '../stores/state'
import type { Note, NoteTextSection } from '../types/note'
import { appStore } from '../stores/app'
import { activeEditor } from '../stores/editor'

const props = defineProps<{
  note: Note
  sectionName: 'head' | 'body' | 'autoBody'
}>()

const section = computed(() => props.note[props.sectionName])
const isEditing = computed(() => appStore.editingNoteId.value === props.note.id)
const isReadOnly = computed(() => props.sectionName === 'autoBody')

// Track the last content written BY the editor, so the watcher can skip round-trips.
// Reference equality check — no timing dependency.
let lastEditorContent: any = null

const editor = useEditor({
  content: section.value.content,
  editable: isReadOnly.value ? false : isEditing.value,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Placeholder.configure({
      placeholder: props.sectionName === 'head' ? 'Title...' : 'Notes...',
    }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    Markdown.configure({
      html: true,
      transformPastedText: true,
      transformCopiedText: false,
    }),
    TiptapImage,
    TrailingParagraph,
  ],
  editorProps: {
    attributes: {
      class: `tiptap-${props.sectionName}`,
    },
  },
  onUpdate: ({ editor }) => {
    if (isReadOnly.value) return
    const json = editor.getJSON()
    lastEditorContent = json
    props.note[props.sectionName].content = json
    appStore.markNoteDirty(props.note, 500)

    // Check for blob:/data: images that need saving to assets
    fixUnsavedImages()
  },
})

function onFocusIn() {
  if (editor.value && isEditing.value) {
    activeEditor.value = editor.value
  }
}

watch(isEditing, (editing) => {
  if (editor.value) {
    if (isReadOnly.value) return  // autoBody never becomes editable
    editor.value.setEditable(editing)
    if (editing) {
      if (props.sectionName === 'head') {
        setTimeout(() => {
          editor.value?.commands.focus('end')
          activeEditor.value = editor.value!
        }, 0)
      }
    } else {
      if (activeEditor.value === editor.value) {
        activeEditor.value = null
      }
    }
  }
})

watch(
  () => section.value.content,
  (newContent) => {
    if (!editor.value) return
    // Skip if this is the same reference the editor just wrote (prevents round-trip)
    if (newContent === lastEditorContent) return
    // External change (undo, analysis, file replace, etc.)
    editor.value.commands.setContent(newContent, false)
  },
)

const sectionStyle = computed(() => {
  const height = section.value.height
  if (height && height !== 'auto') {
    return { height: `${height}px`, overflow: 'auto' }
  }
  return {}
})

/**
 * DOM-level paste interceptor for images.
 * Uses a capturing listener so it fires BEFORE Tiptap/ProseMirror/Markdown.
 * This guarantees we save images to assets regardless of what Tiptap does.
 */
/**
 * Scan editor for image nodes with blob: or data: URLs.
 * Fetch them, save to assets, and replace src with the filename.
 * Called from onUpdate — debounced to avoid thrashing.
 */
let imageFixPending = false

function fixUnsavedImages() {
  if (imageFixPending || !editor.value) return

  const editorEl = editor.value.view.dom as HTMLElement
  const imgs = editorEl.querySelectorAll('img')
  const unsaved: HTMLImageElement[] = []
  for (const img of imgs) {
    if (/^(blob:|data:image\/)/.test(img.src)) {
      unsaved.push(img)
    }
  }

  if (unsaved.length === 0) return

  imageFixPending = true
  ;(async () => {
    try {
      const storage = getStorage()
      const vaultPath = storage.getVaultPath()
      let changed = false

      for (const img of unsaved) {
        try {
          let base64: string
          let ext: string

          if (img.src.startsWith('blob:')) {
            // Fetch the blob and convert to base64
            const resp = await fetch(img.src)
            const blob = await resp.blob()
            ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
            const buf = await blob.arrayBuffer()
            const bytes = new Uint8Array(buf)
            let binary = ''
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
            base64 = btoa(binary)
          } else {
            // data: URL
            const match = img.src.match(/^data:image\/(\w+);base64,(.+)$/)
            if (!match) continue
            ext = match[1].replace('jpeg', 'jpg')
            base64 = match[2]
          }

          const filename = await saveImageAsset(vaultPath, base64, ext)

          // Find and update the ProseMirror node
          const { state } = editor.value!.view
          let pos: number | null = null
          state.doc.descendants((node, nodePos) => {
            if (pos !== null) return false
            if (node.type.name === 'image' && (node.attrs.src === img.getAttribute('src') || node.attrs.src?.startsWith('blob:') || node.attrs.src?.startsWith('data:image'))) {
              pos = nodePos
              return false
            }
          })

          if (pos !== null) {
            const tr = state.tr.setNodeMarkup(pos, undefined, {
              ...state.doc.nodeAt(pos)!.attrs,
              src: filename,
            })
            editor.value!.view.dispatch(tr)
            changed = true
          }
        } catch (e) {
          console.warn('[image-fix] Failed to save image:', e)
        }
      }

      if (changed) {
        const json = editor.value!.getJSON()
        lastEditorContent = json
        props.note[props.sectionName].content = json
        appStore.markNoteDirty(props.note, 500)
      }
    } finally {
      imageFixPending = false
    }
  })()
}

onBeforeUnmount(() => {
  if (activeEditor.value === editor.value) {
    activeEditor.value = null
  }
  editor.value?.destroy()
})
</script>

<style>
.note-text-section {
  padding: 8px 28px 8px 18px;
  min-height: 1.6em;
}

.note-head {
  font-size: 0.9em;
}

.note-body {
  font-size: 0.85em;
  opacity: 0.9;
}

.note-autoBody {
  font-size: 0.8em;
  opacity: 0.75;
  background: var(--auto-body-bg, rgba(255, 255, 255, 0.03));
  border-left: 2px solid var(--text-faint, #555);
  margin: 0 6px;
  border-radius: 0 4px 4px 0;
  user-select: text;
  cursor: default;
}

.note-editor .tiptap {
  outline: none;
  line-height: 1.5;
  font-size: calc(1em * var(--content-scale, 1));
}

.note-editor .tiptap p {
  margin: 0;
}

.note-editor .tiptap p.is-editor-empty:first-child::before {
  color: var(--text-faint);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.no-wrap .tiptap {
  white-space: nowrap;
  overflow: hidden;
}

.note-text-section:not(.is-editing) .tiptap {
  cursor: inherit;
  caret-color: transparent;
}

.note-text-section:not(.is-editing) .tiptap *::selection {
  background: transparent;
}

/* Hide trailing empty paragraphs when not editing.
   ProseMirror appends these after headings/lists/blockquotes for cursor positioning.
   Useful during editing, but should not render as visible blank space otherwise.
   Covers both <p></p> (:empty) and <p><br></p> (:has(> br:only-child)). */
.note-text-section:not(.is-editing) .tiptap > p:last-child:not(:only-child):empty,
.note-text-section:not(.is-editing) .tiptap > p:last-child:not(:only-child):has(> br:only-child) {
  display: none;
}

/* Headings */
.note-editor .tiptap h1 { font-size: 1.4em; font-weight: 700; margin: 0.3em 0 0.2em; }
.note-editor .tiptap h2 { font-size: 1.15em; font-weight: 600; margin: 0.25em 0 0.15em; }
.note-editor .tiptap h3 { font-size: 1em; font-weight: 600; margin: 0.2em 0 0.1em; }

/* Lists */
.note-editor .tiptap ul,
.note-editor .tiptap ol {
  padding-left: 1.4em;
  margin: 0.2em 0;
}

.note-editor .tiptap li { margin: 0.1em 0; }
.note-editor .tiptap li p { margin: 0; }

/* Task list */
.note-editor .tiptap ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}

.note-editor .tiptap ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.note-editor .tiptap ul[data-type="taskList"] li > label {
  flex-shrink: 0;
  margin-top: 9px;
  cursor: pointer;
}

.note-editor .tiptap ul[data-type="taskList"] li > label input[type="checkbox"] {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-muted);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  display: block;
  position: relative;
}

.note-editor .tiptap ul[data-type="taskList"] li > label input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}

.note-editor .tiptap ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 0px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.note-editor .tiptap ul[data-type="taskList"] li > label input[type="checkbox"]:hover {
  border-color: var(--text-muted);
}

.note-editor .tiptap ul[data-type="taskList"] li > div {
  flex: 1;
  min-width: 0;
}

.note-editor .tiptap ul[data-type="taskList"] li[data-checked="true"] > div {
  text-decoration: line-through;
  opacity: 0.5;
}

/* Text alignment */
.note-editor .tiptap .has-text-align-center { text-align: center; }
.note-editor .tiptap .has-text-align-right { text-align: right; }
.note-editor .tiptap .has-text-align-justify { text-align: justify; }

/* Blockquote */
.note-editor .tiptap blockquote {
  border-left: 3px solid var(--blockquote-border);
  padding-left: 10px;
  margin: 0.3em 0;
  opacity: 0.8;
}

/* Code */
.note-editor .tiptap pre {
  background: var(--code-bg);
  border-radius: 4px;
  padding: 8px 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85em;
  margin: 0.3em 0;
  overflow-x: auto;
}

.note-editor .tiptap code {
  background: var(--code-bg);
  border-radius: 3px;
  padding: 1px 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.88em;
}

/* HR */
.note-editor .tiptap hr {
  border: none;
  border-top: 1px solid var(--blockquote-border);
  margin: 0.5em 0;
}

/* Table */
.note-editor .tiptap table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.3em 0;
  font-size: 0.92em;
}

.note-editor .tiptap table td,
.note-editor .tiptap table th {
  border: 1px solid #555;
  padding: 5px 8px;
  min-width: 60px;
  vertical-align: top;
}

.note-editor .tiptap table th {
  background: var(--bg-surface-hover);
  font-weight: 600;
}

.note-editor .tiptap table td p,
.note-editor .tiptap table th p {
  margin: 0;
}

.note-editor .tiptap table .selectedCell {
  background: var(--accent-bg);
}

/* Inline images */
.tiptap-image-wrapper {
  display: block;
  margin: 4px 0;
  line-height: 0;
}

.tiptap-image-wrapper img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  display: block;
}

.is-editing .tiptap-image-wrapper.selected img {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.image-loading,
.image-error {
  padding: 12px;
  text-align: center;
  font-size: 0.75em;
  color: var(--text-muted);
  background: var(--bg-surface-hover);
  border-radius: 4px;
  line-height: normal;
}
</style>
