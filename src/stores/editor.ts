/**
 * Shared ref for the currently focused Tiptap editor instance.
 * NoteTextSection sets this on focus, FormatBar reads it.
 */

import { shallowRef } from 'vue'
import type { Editor } from '@tiptap/vue-3'

export const activeEditor = shallowRef<Editor | null>(null)
