<template>
  <node-view-wrapper class="tiptap-image-wrapper" :class="{ selected: selected }">
    <img
      v-if="resolvedUrl"
      :src="resolvedUrl"
      :alt="node.attrs.alt || ''"
      :title="node.attrs.title || ''"
      draggable="true"
      @load="onLoad"
      @error="onError"
    />
    <div v-else-if="loadError" class="image-error">Image not found</div>
    <div v-else class="image-loading">Loading…</div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { resolveAssetUrl } from '../utils/assets'
import { getStorage } from '../stores/state'

const props = defineProps(nodeViewProps)

const resolvedUrl = ref<string | null>(null)
const loadError = ref(false)

async function resolve() {
  const src = props.node.attrs.src
  if (!src) return

  // Already a full URL (http, data, blob) — use directly
  if (/^(https?:|blob:|data:)/.test(src)) {
    resolvedUrl.value = src
    return
  }

  try {
    const storage = getStorage()
    const vaultPath = storage.getVaultPath()
    resolvedUrl.value = await resolveAssetUrl(vaultPath, src)
  } catch (e) {
    console.error('[ImageNodeView] Failed to resolve:', src, e)
    loadError.value = true
  }
}

function onLoad() {
  loadError.value = false
}

function onError() {
  loadError.value = true
}

onMounted(resolve)
watch(() => props.node.attrs.src, resolve)
</script>

<style>
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

.tiptap-image-wrapper.selected img {
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
}
</style>
