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
  </div>
  <VaultPicker v-else-if="needsVault" @selected="onVaultSelected" />
  <div v-else class="loading-screen">
    <p>Loading…</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
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

onMounted(async () => {
  await loadSettings()
  await loadUserTheme()

  const vaultPath = await getVaultPath()
  if (vaultPath) {
    await initWithVault(vaultPath)
  } else {
    needsVault.value = true
  }
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
</script>
