/**
 * TrailingParagraph — handles the "stuck empty paragraph after heading" issue.
 *
 * In ProseMirror, pressing Enter at the end of a heading creates a new paragraph.
 * Pressing Backspace at the start of that empty paragraph sometimes doesn't join it
 * back into the heading. This extension adds a Backspace handler that deletes the
 * empty paragraph outright, placing the cursor at the end of the preceding heading.
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

        // Must have a heading immediately before this paragraph
        const posBefore = $from.before()
        if (posBefore <= 0) return false
        const resolved = state.doc.resolve(posBefore)
        const nodeBefore = resolved.nodeBefore
        if (!nodeBefore || nodeBefore.type.name !== 'heading') return false

        // Delete the empty paragraph, cursor lands at end of heading
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
