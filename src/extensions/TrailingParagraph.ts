/**
 * TrailingParagraph — handles "stuck empty paragraph" after block-level nodes.
 *
 * When you convert a line to a heading or toggle a list, ProseMirror may leave
 * an empty paragraph that Backspace can't remove because it won't join
 * different node types. This extension intercepts Backspace at position 0
 * of an empty paragraph and deletes it outright.
 */

import { Extension } from '@tiptap/core'

export const TrailingParagraph = Extension.create({
  name: 'trailingParagraph',

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state } = editor
        const { selection } = state
        const { $from, empty } = selection

        if (!empty) return false

        // Only handle cursor at position 0 of an empty paragraph
        if ($from.parentOffset !== 0) return false
        if ($from.parent.type.name !== 'paragraph') return false
        if ($from.parent.content.size !== 0) return false

        // Must have a preceding sibling that is NOT a paragraph
        // (headings, lists, blockquotes, code blocks, etc.)
        const posBefore = $from.before()
        if (posBefore <= 0) return false
        const resolved = state.doc.resolve(posBefore)
        const nodeBefore = resolved.nodeBefore
        if (!nodeBefore) return false
        // If the previous node is also a paragraph, let default Backspace handle it
        if (nodeBefore.type.name === 'paragraph') return false

        // Don't delete if this is the only block in the doc
        if (state.doc.childCount <= 1) return false

        // Delete the empty paragraph, cursor lands at end of previous node
        const from = $from.before()
        const to = $from.after()
        editor.chain()
          .command(({ tr }) => {
            tr.delete(from, to)
            return true
          })
          .run()
        return true
      },
    }
  },
})
