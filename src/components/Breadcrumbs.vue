<template>
  <div v-if="crumbs.length > 0" class="breadcrumbs">
    <template v-for="(crumb, i) in crumbs" :key="crumb.id">
      <span v-if="i > 0" class="breadcrumb-sep">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <button
        class="breadcrumb-item"
        :class="{ current: crumb.isCurrent }"
        @click="crumb.isCurrent ? null : goTo(i)"
        :title="crumb.title"
      >
        {{ crumb.title }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { appStore } from '../stores/app'

interface Crumb {
  id: string
  title: string
  isCurrent: boolean
}

const crumbs = computed<Crumb[]>(() => {
  const result: Crumb[] = []

  // Walk the history stack — each entry is a page ID
  for (const pageId of appStore.pageHistory.value) {
    const page = appStore.pageList.value.find(p => p.id === pageId)
    if (!page) continue  // skip deleted/zombie pages
    result.push({
      id: pageId,
      title: page.title || 'Untitled',
      isCurrent: false,
    })
  }

  // Current page
  if (appStore.currentPage.value) {
    result.push({
      id: appStore.currentPage.value.id,
      title: appStore.currentPage.value.title || 'Untitled',
      isCurrent: true,
    })
  }

  return result
})

async function goTo(index: number) {
  // Navigate to the page at this breadcrumb index
  // We need to pop the history back to that point
  const targetId = crumbs.value[index].id

  // Trim history to just before the target
  appStore.pageHistory.value = appStore.pageHistory.value.slice(0, index)

  await appStore.loadPage(targetId)
}
</script>

<style>
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 12px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-subtle);
  min-height: 32px;
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.breadcrumbs::-webkit-scrollbar {
  display: none;
}

.breadcrumb-item {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.8em;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s ease, color 0.12s ease;
}

.breadcrumb-item:hover:not(.current) {
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
}

.breadcrumb-item.current {
  color: var(--text-primary);
  cursor: default;
  font-weight: 500;
}

.breadcrumb-sep {
  color: var(--text-faint);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
</style>
