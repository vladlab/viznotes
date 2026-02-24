<template>
  <div class="format-bar" v-if="editor">
    <!-- Text style -->
    <button :class="{ active: editor.isActive('bold') }" @pointerdown.prevent="editor.chain().focus().toggleBold().run()" title="Bold (Ctrl+B)">B</button>
    <button :class="{ active: editor.isActive('italic') }" @pointerdown.prevent="editor.chain().focus().toggleItalic().run()" title="Italic (Ctrl+I)"><em>I</em></button>
    <button :class="{ active: editor.isActive('underline') }" @pointerdown.prevent="editor.chain().focus().toggleUnderline().run()" title="Underline (Ctrl+U)"><u>U</u></button>
    <button :class="{ active: editor.isActive('strike') }" @pointerdown.prevent="editor.chain().focus().toggleStrike().run()" title="Strikethrough"><s>S</s></button>

    <div class="bar-sep" />

    <!-- Headings -->
    <button :class="{ active: editor.isActive('heading', { level: 1 }) }" @pointerdown.prevent="editor.chain().focus().toggleHeading({ level: 1 }).run()" title="Heading 1">H1</button>
    <button :class="{ active: editor.isActive('heading', { level: 2 }) }" @pointerdown.prevent="editor.chain().focus().toggleHeading({ level: 2 }).run()" title="Heading 2">H2</button>
    <button :class="{ active: editor.isActive('heading', { level: 3 }) }" @pointerdown.prevent="editor.chain().focus().toggleHeading({ level: 3 }).run()" title="Heading 3">H3</button>

    <div class="bar-sep" />

    <!-- Lists -->
    <button :class="{ active: editor.isActive('bulletList') }" @pointerdown.prevent="editor.chain().focus().toggleBulletList().run()" title="Bullet list">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="4" cy="6" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="4" cy="18" r="2"/><rect x="9" y="5" width="12" height="2" rx="1"/><rect x="9" y="11" width="12" height="2" rx="1"/><rect x="9" y="17" width="12" height="2" rx="1"/></svg>
    </button>
    <button :class="{ active: editor.isActive('orderedList') }" @pointerdown.prevent="editor.chain().focus().toggleOrderedList().run()" title="Numbered list">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><text x="1" y="8" font-size="7" font-weight="600">1</text><text x="1" y="14" font-size="7" font-weight="600">2</text><text x="1" y="20" font-size="7" font-weight="600">3</text><rect x="9" y="5" width="12" height="2" rx="1"/><rect x="9" y="11" width="12" height="2" rx="1"/><rect x="9" y="17" width="12" height="2" rx="1"/></svg>
    </button>
    <button :class="{ active: editor.isActive('taskList') }" @pointerdown.prevent="editor.chain().focus().toggleTaskList().run()" title="Task list">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6" rx="1"/><path d="M4.5 6.5l1.5 1.5 3-3" stroke-width="1.5"/><rect x="3" y="14" width="6" height="6" rx="1"/><rect x="13" y="5" width="8" height="2" rx="1" fill="currentColor" stroke="none"/><rect x="13" y="16" width="8" height="2" rx="1" fill="currentColor" stroke="none"/></svg>
    </button>

    <div class="bar-sep" />

    <!-- Block types -->
    <button :class="{ active: editor.isActive('blockquote') }" @pointerdown.prevent="editor.chain().focus().toggleBlockquote().run()" title="Blockquote">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z"/></svg>
    </button>
    <button :class="{ active: editor.isActive('codeBlock') }" @pointerdown.prevent="editor.chain().focus().toggleCodeBlock().run()" title="Code block">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
    </button>

    <div class="bar-sep" />

    <!-- Alignment -->
    <button :class="{ active: editor.isActive({ textAlign: 'left' }) }" @pointerdown.prevent="editor.chain().focus().setTextAlign('left').run()" title="Align left">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="3" y="9" width="12" height="2" rx="1"/><rect x="3" y="14" width="16" height="2" rx="1"/><rect x="3" y="19" width="10" height="2" rx="1"/></svg>
    </button>
    <button :class="{ active: editor.isActive({ textAlign: 'center' }) }" @pointerdown.prevent="editor.chain().focus().setTextAlign('center').run()" title="Align center">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="6" y="9" width="12" height="2" rx="1"/><rect x="4" y="14" width="16" height="2" rx="1"/><rect x="7" y="19" width="10" height="2" rx="1"/></svg>
    </button>
    <button :class="{ active: editor.isActive({ textAlign: 'right' }) }" @pointerdown.prevent="editor.chain().focus().setTextAlign('right').run()" title="Align right">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="9" y="9" width="12" height="2" rx="1"/><rect x="5" y="14" width="16" height="2" rx="1"/><rect x="11" y="19" width="10" height="2" rx="1"/></svg>
    </button>
  </div>
  <div class="format-bar format-bar-empty" v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { activeEditor } from '../stores/editor'
import { appStore } from '../stores/app'

const editor = computed(() => {
  // Only show when actively editing
  if (!appStore.editingNoteId.value) return null
  return activeEditor.value
})
</script>

<style>
.format-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 12px;
  background: var(--format-bar-bg);
  border-bottom: 1px solid var(--border-subtle);
  height: 37px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.format-bar-empty {
  pointer-events: none;
}

.format-bar button {
  width: 30px;
  height: 28px;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 0.88em;
  font-weight: 600;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.format-bar button svg {
  width: 16px;
  height: 16px;
}

.format-bar button:hover {
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
}

.format-bar button.active {
  background: var(--accent-bg);
  color: var(--accent-text);
}

.format-bar button em { font-style: italic; }
.format-bar button u { text-decoration: underline; }
.format-bar button s { text-decoration: line-through; }

.bar-sep {
  width: 1px;
  height: 18px;
  background: var(--border-input);
  margin: 0 4px;
  flex-shrink: 0;
}
</style>
