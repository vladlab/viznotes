<template>
  <div class="app-layout" v-if="ready">
    <Sidebar />
    <main class="main-content">
      <Breadcrumbs />
      <FormatBar v-if="appStore.currentPage.value" />
      <CanvasView v-if="appStore.currentPage.value" />
      <div v-else class="welcome-screen">
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
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Sidebar from './components/Sidebar.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'
import FormatBar from './components/FormatBar.vue'
import CanvasView from './components/CanvasView.vue'
import VaultPicker from './components/VaultPicker.vue'
import { appStore } from './stores/app'
import { getVaultPath, setVaultPath, createFileStorage } from './storage/index'
import { loadSettings } from './stores/settings'
import { loadUserTheme } from './utils/themeLoader'

const ready = ref(false)
const needsVault = ref(false)

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
