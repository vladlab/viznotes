<template>
  <div
    v-if="section.enabled"
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
import type { Note, NoteTextSection } from '../types/note'
import { appStore } from '../stores/app'
import { activeEditor } from '../stores/editor'

const props = defineProps<{
  note: Note
  sectionName: 'head' | 'body'
}>()

const section = computed(() => props.note[props.sectionName])
const isEditing = computed(() => appStore.editingNoteId.value === props.note.id)

let suppressContentWatch = false

const editor = useEditor({
  content: section.value.content,
  editable: isEditing.value,
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
  ],
  editorProps: {
    attributes: {
      class: `tiptap-${props.sectionName}`,
    },
  },
  onUpdate: ({ editor }) => {
    suppressContentWatch = true
    props.note[props.sectionName].content = editor.getJSON()
    appStore.markNoteDirty(props.note, 500)
    suppressContentWatch = false
  },
})

function onFocusIn() {
  if (editor.value && isEditing.value) {
    activeEditor.value = editor.value
  }
}

watch(isEditing, (editing) => {
  if (editor.value) {
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
    if (suppressContentWatch || !editor.value) return
    const editorJson = JSON.stringify(editor.value.getJSON())
    const newJson = JSON.stringify(newContent)
    if (editorJson !== newJson) {
      editor.value.commands.setContent(newContent, false)
    }
  },
  { deep: true }
)

const sectionStyle = computed(() => {
  const height = section.value.height
  if (height && height !== 'auto') {
    return { height: `${height}px`, overflow: 'auto' }
  }
  return {}
})

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
</style>
