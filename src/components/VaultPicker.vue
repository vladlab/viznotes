<template>
  <div class="vault-picker">
    <div class="vault-card">
      <h1>vizNotes</h1>
      <p>Choose a folder to store your notes. This is your vault — all pages, notes, and arrows are saved as readable JSON files inside it.</p>

      <div class="vault-actions">
        <button class="vault-btn primary" @click="openVault">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Open existing vault
        </button>
        <button class="vault-btn primary" @click="createVault">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create new vault
        </button>
      </div>

      <div v-if="error" class="vault-error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'selected', path: string): void
}>()

const error = ref('')

async function openVault() {
  error.value = ''
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false, title: 'Choose your vault folder' })
    if (selected) emit('selected', selected as string)
  } catch (e: any) {
    error.value = `Failed to open folder picker: ${e.message || e}`
  }
}

async function createVault() {
  error.value = ''
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false, title: 'Choose where to create your vault' })
    if (selected) {
      const vaultPath = `${selected}/viznotes`
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('ensure_dir', { path: vaultPath })
      emit('selected', vaultPath)
    }
  } catch (e: any) {
    error.value = `Failed to create vault: ${e.message || e}`
  }
}
</script>

<style>
.vault-picker { display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; background: var(--bg-app); }
.vault-card { max-width: 480px; padding: 48px 40px; text-align: center; }
.vault-card h1 { font-size: 1.8em; font-weight: 300; color: var(--text-secondary); margin-bottom: 16px; }
.vault-card p { color: var(--text-muted); font-size: 0.9em; line-height: 1.6; margin-bottom: 32px; }
.vault-actions { display: flex; flex-direction: column; gap: 12px; }
.vault-btn { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px 24px; border-radius: 8px; font-size: 0.95em; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
.vault-btn.primary { background: rgba(66, 165, 245, 0.12); border: 1px solid rgba(66, 165, 245, 0.3); color: var(--accent-text); }
.vault-btn.primary:hover { background: rgba(66, 165, 245, 0.2); border-color: rgba(66, 165, 245, 0.5); }
.vault-error { margin-top: 16px; padding: 10px 14px; background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.3); border-radius: 6px; color: var(--danger-text); font-size: 0.82em; }
</style>
