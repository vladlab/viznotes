<template>
  <div class="app-layout" v-if="ready">
    <Sidebar />
    <main class="main-content">
      <Breadcrumbs />
      <FormatBar v-if="appStore.currentPage.value" />
      <SplitView v-if="hasAnyPage" />
      <div v-if="!hasAnyPage" class="welcome-screen">
        <h1>vizNotes</h1>
        <p>Create a page to get started, or select one from the sidebar.</p>
        <button class="welcome-btn" @click="createFirst">
          + Create First Page
        </button>
        <button class="change-vault-btn" @click="changeVault">
          Change vault folder
        </button>
      </div>
    </main>
    <button
      v-if="hasAnyPage"
      class="window-split-btn"
      :class="{ active: appStore.splitActive.value }"
      @click="toggleSplit"
      :title="appStore.splitActive.value ? 'Close split view' : 'Split view'"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="12" y1="3" x2="12" y2="21" />
      </svg>
    </button>
    <button class="window-close-btn" @click="closeWindow" title="Close window">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
  <VaultPicker v-else-if="needsVault" @selected="onVaultSelected" />
  <div v-else class="loading-screen">
    <p>Loading…</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Sidebar from './components/Sidebar.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'
import FormatBar from './components/FormatBar.vue'
import SplitView from './components/SplitView.vue'
import VaultPicker from './components/VaultPicker.vue'
import { appStore } from './stores/app'
import { initPrimaryPane, panes } from './stores/panes'
import { flushPendingSaves, unloadPageData } from './stores/state'
import { history } from './stores/history'
import { getVaultPath, setVaultPath, createFileStorage } from './storage/index'
import { loadSettings } from './stores/settings'
import { loadUserTheme } from './utils/themeLoader'

const ready = ref(false)
const needsVault = ref(false)

// Check if any pane has a page loaded
const hasAnyPage = computed(() => {
  for (const pane of panes.values()) {
    if (pane.pageId) return true
  }
  return false
})

// Flush pending saves before the window closes (best-effort, fires synchronously)
function onBeforeUnload() {
  appStore.flushPendingSaves()
}

onMounted(async () => {
  await loadSettings()
  await loadUserTheme()

  window.addEventListener('beforeunload', onBeforeUnload)

  const vaultPath = await getVaultPath()
  if (vaultPath) {
    await initWithVault(vaultPath)
  } else {
    needsVault.value = true
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})

async function initWithVault(vaultPath: string) {
  try {
    const storage = await createFileStorage(vaultPath)
    appStore.setStorage(storage)
    await appStore.loadPageList()
    // Initialize the primary pane
    initPrimaryPane(null)
    ready.value = true
  } catch (e) {
    console.error('Failed to init vault:', e)
    needsVault.value = true
  }
}

async function onVaultSelected(vaultPath: string) {
  await setVaultPath(vaultPath)
  needsVault.value = false
  await initWithVault(vaultPath)
}

async function changeVault() {
  ready.value = false
  needsVault.value = true
}

async function createFirst() {
  const page = await appStore.createPage('My First Page')
  await appStore.navigateToPage(page.id, false)
}

async function toggleSplit() {
  if (appStore.splitActive.value) {
    // Close the secondary (right) pane
    const allPanes = Array.from(panes.values())
    const secondary = allPanes.find(p => p.id !== allPanes[0]?.id)
    if (secondary) {
      const closedPageId = appStore.closeSplitPane(secondary.id)
      if (closedPageId && appStore.paneCountForPage(closedPageId) === 0) {
        await flushPendingSaves()
        unloadPageData(closedPageId)
        history.purgePageActions(closedPageId)
      }
    }
  } else {
    const newPane = appStore.openSplitPane(null)
    appStore.setActivePane(newPane.id)
  }
}

async function closeWindow() {
  await appStore.flushPendingSaves()
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('exit_app')
  } catch (e) {
    console.error('Close failed:', e)
    window.close()
  }
}
</script>

<style scoped>
.window-split-btn {
  position: fixed;
  top: 6px;
  right: 40px;
  z-index: 9999;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s, background 0.15s;
}
.window-split-btn:hover {
  opacity: 1;
  background: var(--bg-surface-hover);
}
.window-split-btn.active {
  opacity: 0.9;
  color: var(--accent);
}
.window-close-btn {
  position: fixed;
  top: 6px;
  right: 8px;
  z-index: 9999;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s, background 0.15s;
}
.window-close-btn:hover {
  opacity: 1;
  background: rgba(255, 80, 80, 0.25);
  color: #ff5555;
}
</style>
