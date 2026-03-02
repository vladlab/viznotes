/**
 * Custom Tiptap Image extension for inline images.
 * 
 * Stores only the asset filename in `src` (e.g. "abc123.png").
 * Uses a simple DOM-based nodeView that resolves filenames to data URLs.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { resolveAssetUrl } from '../utils/assets'
import { getStorage } from '../stores/state'

export const TiptapImage = Node.create({
  name: 'image',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ({ node, selected }) => {
      const wrapper = document.createElement('div')
      wrapper.className = 'tiptap-image-wrapper'
      if (selected) wrapper.classList.add('selected')

      const img = document.createElement('img')
      img.alt = node.attrs.alt || ''
      img.title = node.attrs.title || ''
      img.draggable = true

      const src = node.attrs.src
      if (!src) {
        wrapper.textContent = 'No image'
      } else if (/^(data:|https?:|blob:)/.test(src)) {
        img.src = src
        wrapper.appendChild(img)
      } else {
        // Asset filename — resolve to data URL
        const placeholder = document.createElement('div')
        placeholder.className = 'image-loading'
        placeholder.textContent = 'Loading…'
        wrapper.appendChild(placeholder)

        try {
          const storage = getStorage()
          const vaultPath = storage.getVaultPath()
          resolveAssetUrl(vaultPath, src).then(url => {
            img.src = url
            wrapper.replaceChild(img, placeholder)
          }).catch(() => {
            placeholder.className = 'image-error'
            placeholder.textContent = 'Image not found'
          })
        } catch {
          placeholder.className = 'image-error'
          placeholder.textContent = 'Image not found'
        }
      }

      return {
        dom: wrapper,
        update(updatedNode) {
          if (updatedNode.type.name !== 'image') return false
          // src unchanged — keep current DOM
          if (updatedNode.attrs.src === node.attrs.src) return true
          return false // re-create for new src
        },
        selectNode() {
          wrapper.classList.add('selected')
        },
        deselectNode() {
          wrapper.classList.remove('selected')
        },
      }
    }
  },
})
