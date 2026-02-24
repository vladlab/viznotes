<template>
  <div class="sidebar" :class="{ collapsed: !expanded }">
    <div class="sidebar-header">
      <h2 v-if="expanded">vizNotes</h2>
      <button class="sidebar-toggle" @click="expanded = !expanded">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path
            :d="expanded ? 'M10 2 L4 8 L10 14' : 'M6 2 L12 8 L6 14'"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>

    <template v-if="expanded">
      <!-- Navigation -->
      <div v-if="appStore.pageHistory.value.length > 0" class="sidebar-nav">
        <button class="nav-back" @click="appStore.navigateBack()">
          ← Back
        </button>
      </div>

      <!-- Page list -->
      <div class="page-list">
        <div class="page-search-row">
          <input
            type="text"
            class="page-search"
            v-model="pageSearch"
            placeholder="Search pages…"
            spellcheck="false"
          />
          <button class="new-page-btn-icon" @click="createNewPage" title="New page">+</button>
        </div>

        <div
          v-for="page in filteredPages"
          :key="page.id"
          class="page-item"
          :class="{ active: page.id === appStore.currentPageId.value }"
          @click="appStore.navigateToPage(page.id, false)"
          @dblclick="startRename(page)"
          @contextmenu.prevent="showPageMenu(page, $event)"
        >
          <span class="page-title">{{ page.title || 'Untitled' }}</span>
          <span class="page-date">{{ formatDate(page.updatedAt) }}</span>
        </div>

        <div v-if="filteredPages.length === 0 && appStore.pageList.value.length > 0" class="empty-state">
          No pages matching "{{ pageSearch }}"
        </div>
        <div v-if="appStore.pageList.value.length === 0" class="empty-state">
          No pages yet. Create one to get started!
        </div>
      </div>

      <!-- Import/Export -->
      <div class="sidebar-footer">
        <button class="footer-btn" @click="exportAll" title="Export all data">
          Export
        </button>
        <button class="footer-btn" @click="triggerImport" title="Import data">
          Import
        </button>
        <button class="footer-btn settings-btn" @click="showSettings = true" title="Settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
        <input
          ref="importInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="importFile"
        />
      </div>

      <SettingsPanel v-if="showSettings" @close="showSettings = false" />
    </template>

    <!-- Page context menu -->
    <Teleport to="body">
      <div
        v-if="pageMenuVisible"
        class="context-menu"
        :style="{ left: `${pageMenuPos.x}px`, top: `${pageMenuPos.y}px` }"
        @pointerdown.stop
      >
        <button @click="renamePage">Rename</button>
        <button class="danger" @click="confirmDeletePage">Delete</button>
      </div>
    </Teleport>

    <!-- Delete confirmation -->
    <Teleport to="body">
      <div v-if="deleteConfirmVisible" class="confirm-overlay" @pointerdown.self="deleteConfirmVisible = false">
        <div class="confirm-dialog">
          <p>Delete "{{ deleteConfirmTarget?.title }}"?</p>
          <p class="confirm-sub">This cannot be undone.</p>
          <div class="confirm-actions">
            <button class="confirm-cancel" @click="deleteConfirmVisible = false">Cancel</button>
            <button class="confirm-delete" @click="executeDelete">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { appStore } from '../stores/app'
import type { PageSummary } from '../types/page'
import SettingsPanel from './SettingsPanel.vue'

const showSettings = ref(false)

const expanded = ref(true)
const importInput = ref<HTMLInputElement | null>(null)
const pageSearch = ref('')

const filteredPages = computed(() => {
  const q = pageSearch.value.toLowerCase().trim()
  if (!q) return appStore.pageList.value
  return appStore.pageList.value.filter(p =>
    (p.title || 'Untitled').toLowerCase().includes(q)
  )
})

// Page context menu
const pageMenuVisible = ref(false)
const pageMenuPos = ref({ x: 0, y: 0 })
const pageMenuTarget = ref<PageSummary | null>(null)

onMounted(async () => {
  // Auto-load first page if available
  if (appStore.pageList.value.length > 0) {
    await appStore.navigateToPage(appStore.pageList.value[0].id, false)
  }
})

async function createNewPage() {
  const page = await appStore.createPage('Untitled')
  await appStore.navigateToPage(page.id, false)
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function startRename(page: PageSummary) {
  const title = prompt('Rename page:', page.title)
  if (title !== null && title.trim()) {
    appStore.renamePage(page.id, title.trim())
  }
}

function showPageMenu(page: PageSummary, e: MouseEvent) {
  pageMenuTarget.value = page
  pageMenuPos.value = { x: e.clientX, y: e.clientY }
  pageMenuVisible.value = true

  const close = () => {
    pageMenuVisible.value = false
    window.removeEventListener('pointerdown', close)
  }
  setTimeout(() => window.addEventListener('pointerdown', close), 0)
}

function renamePage() {
  if (pageMenuTarget.value) {
    startRename(pageMenuTarget.value)
  }
  pageMenuVisible.value = false
}

const deleteConfirmVisible = ref(false)
const deleteConfirmTarget = ref<PageSummary | null>(null)

function confirmDeletePage() {
  deleteConfirmTarget.value = pageMenuTarget.value
  pageMenuVisible.value = false
  deleteConfirmVisible.value = true
}

async function executeDelete() {
  if (deleteConfirmTarget.value) {
    await appStore.deletePage(deleteConfirmTarget.value.id)
  }
  deleteConfirmVisible.value = false
  deleteConfirmTarget.value = null
}

async function exportAll() {
  const data = await appStore.exportData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `viznotes-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  importInput.value?.click()
}

async function importFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (data.pages && data.notes) {
      if (confirm('This will replace all existing data. Continue?')) {
        await appStore.importData(data)
      }
    } else {
      alert('Invalid export file format.')
    }
  } catch {
    alert('Failed to parse file.')
  }

  // Reset input
  if (importInput.value) importInput.value.value = ''
}
</script>

<style>
.sidebar {
  width: 260px;
  min-width: 260px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease, min-width 0.2s ease;
}

.sidebar.collapsed {
  width: 40px;
  min-width: 40px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.sidebar-header h2 {
  font-size: 0.95em;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
  white-space: nowrap;
}

.sidebar-toggle {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.sidebar-toggle:hover {
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
}

.sidebar-nav {
  padding: 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.nav-back {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.82em;
  padding: 4px 8px;
  border-radius: 4px;
}

.nav-back:hover {
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
}

.page-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.page-search-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.page-search {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  color: var(--text-secondary);
  padding: 6px 10px;
  font-size: 0.8em;
  border-radius: 6px;
  outline: none;
  min-width: 0;
}

.page-search:focus {
  border-color: var(--border-input-focus);
}

.page-search::placeholder {
  color: var(--text-faint);
}

.new-page-btn-icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: none;
  border: 1px dashed var(--border-main);
  color: var(--text-muted);
  font-size: 1.1em;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.new-page-btn-icon:hover {
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
  border-color: var(--border-input-focus);
}

.page-item {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  margin-bottom: 2px;
}

.page-item:hover {
  background: var(--bg-surface-hover);
}

.page-item.active {
  background: var(--bg-surface-hover);
}

.page-title {
  font-size: 0.85em;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.page-date {
  font-size: 0.7em;
  color: var(--text-faint);
  margin-top: 2px;
}

.empty-state {
  text-align: center;
  color: var(--text-faint);
  font-size: 0.8em;
  padding: 24px 12px;
}

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  gap: 4px;
}

.footer-btn {
  flex: 1;
  background: none;
  border: 1px solid var(--border-main);
  color: var(--text-muted);
  padding: 6px;
  font-size: 0.75em;
  cursor: pointer;
  border-radius: 4px;
}

.footer-btn:hover {
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
}

.settings-btn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.confirm-dialog {
  background: var(--controls-bg);
  border: 1px solid var(--border-main);
  border-radius: 10px;
  padding: 24px 28px;
  min-width: 300px;
  box-shadow: var(--shadow-dialog);
}

.confirm-dialog p {
  color: var(--text-secondary);
  font-size: 0.92em;
  margin: 0;
}

.confirm-sub {
  color: var(--text-muted) !important;
  font-size: 0.8em !important;
  margin-top: 6px !important;
}

.confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

.confirm-cancel, .confirm-delete {
  padding: 7px 18px;
  border-radius: 6px;
  font-size: 0.82em;
  cursor: pointer;
  border: 1px solid var(--border-main);
}

.confirm-cancel {
  background: none;
  color: var(--text-muted);
}

.confirm-cancel:hover {
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
}

.confirm-delete {
  background: var(--danger-bg);
  border-color: rgba(244, 67, 54, 0.4);
  color: var(--danger-text);
}

.confirm-delete:hover {
  background: rgba(244, 67, 54, 0.25);
  color: var(--danger-text);
}
</style>
