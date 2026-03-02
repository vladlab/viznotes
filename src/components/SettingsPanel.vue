<template>
  <Teleport to="body">
    <div class="settings-overlay" @pointerdown.self="$emit('close')">
      <div class="settings-panel">
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="settings-close" @click="$emit('close')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="settings-body">
          <!-- Vault -->
          <section class="settings-section">
            <h3>Vault</h3>
            <div class="setting-row">
              <label>Location</label>
              <div class="vault-path-row">
                <span class="vault-path" :title="vaultPath || 'Not set'">{{ vaultPath || 'Not set' }}</span>
                <button class="btn-small" @click="changeVault">Change…</button>
              </div>
            </div>
            <div class="setting-row">
              <label>Assets</label>
              <div class="vault-path-row">
                <span v-if="cleanupResult" class="cleanup-result">{{ cleanupResult }}</span>
                <button class="btn-small" @click="cleanupOrphanedAssets" :disabled="cleaningUp">
                  {{ cleaningUp ? 'Scanning…' : 'Clean up unused assets' }}
                </button>
              </div>
            </div>
          </section>

          <!-- Appearance -->
          <section class="settings-section">
            <h3>Appearance</h3>

            <div class="setting-row">
              <label>Theme</label>
              <div class="theme-picker">
                <button
                  class="theme-swatch dark"
                  :class="{ active: settings.theme === 'dark' }"
                  @click="settings.theme = 'dark'"
                  title="Dark"
                >
                  <span class="swatch-preview" style="background: #1a1a1a; border-color: #444;">
                    <span class="swatch-dot" style="background: #4a4a4a;" />
                    <span class="swatch-dot" style="background: #4a4a4a;" />
                  </span>
                  <span class="swatch-label">Dark</span>
                </button>
                <button
                  class="theme-swatch paper"
                  :class="{ active: settings.theme === 'paper' }"
                  @click="settings.theme = 'paper'"
                  title="Paper"
                >
                  <span class="swatch-preview" style="background: #d5cec0; border-color: #b8b0a0;">
                    <span class="swatch-dot" style="background: #b8b0a0;" />
                    <span class="swatch-dot" style="background: #b8b0a0;" />
                  </span>
                  <span class="swatch-label">Paper</span>
                </button>
              </div>
            </div>

            <div class="setting-row">
              <label>UI Scale</label>
              <div class="scale-control">
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.05"
                  :value="settings.uiScale"
                  @input="onScaleChange"
                />
                <span class="scale-value">{{ Math.round(settings.uiScale * 100) }}%</span>
                <button class="btn-small" @click="settings.uiScale = 1.0">Reset</button>
              </div>
            </div>

            <div class="setting-row">
              <label>Content Size</label>
              <div class="scale-control">
                <input
                  type="range"
                  min="0.7"
                  max="2.0"
                  step="0.05"
                  :value="settings.contentScale"
                  @input="onContentScaleChange"
                />
                <span class="scale-value">{{ Math.round(settings.contentScale * 100) }}%</span>
                <button class="btn-small" @click="settings.contentScale = 1.0">Reset</button>
              </div>
            </div>

            <div class="setting-row">
              <label>Font</label>
              <div class="font-control">
                <input
                  type="text"
                  class="font-input"
                  v-model="fontSearch"
                  placeholder="Search fonts…"
                  spellcheck="false"
                />
                <div class="font-presets">
                  <button
                    class="font-preset-btn"
                    :class="{ active: settings.fontFamily === '' }"
                    @click="settings.fontFamily = ''"
                  >System default</button>
                  <button
                    v-for="font in filteredFonts"
                    :key="font"
                    class="font-preset-btn"
                    :class="{ active: settings.fontFamily === font }"
                    @click="settings.fontFamily = font"
                  >{{ font }}</button>
                </div>
                <div v-if="fontsLoading" class="font-loading">Loading system fonts…</div>
                <div v-else-if="totalFonts > 50 && filteredFonts.length >= 50" class="font-loading">
                  Showing 50 of {{ totalFonts }} — type to search
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { settings } from '../stores/settings'

defineEmits<{ (e: 'close'): void }>()

const vaultPath = ref<string | null>(null)
const systemFonts = ref<string[]>([])
const fontsLoading = ref(false)
const fontSearch = ref('')
const cleaningUp = ref(false)
const cleanupResult = ref<string | null>(null)

const filteredFonts = computed(() => {
  const q = fontSearch.value.toLowerCase()
  const fonts = systemFonts.value
  if (!q) return fonts.slice(0, 50)
  return fonts.filter(f => f.toLowerCase().includes(q)).slice(0, 50)
})

const totalFonts = computed(() => {
  const q = fontSearch.value.toLowerCase()
  if (!q) return systemFonts.value.length
  return systemFonts.value.filter(f => f.toLowerCase().includes(q)).length
})

onMounted(async () => {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    vaultPath.value = await invoke<string | null>('get_vault_path')

    fontsLoading.value = true
    systemFonts.value = await invoke<string[]>('list_system_fonts')
    fontsLoading.value = false
  } catch (e) {
    fontsLoading.value = false
    console.warn('Failed to load system fonts:', e)
  }
})

function onScaleChange(e: Event) {
  settings.uiScale = parseFloat((e.target as HTMLInputElement).value)
}

function onContentScaleChange(e: Event) {
  settings.contentScale = parseFloat((e.target as HTMLInputElement).value)
}

async function changeVault() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false, title: 'Choose vault folder' })
    if (selected) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('set_vault_path', { vaultPath: selected as string })
      vaultPath.value = selected as string
      // Reload to reinitialize storage with new vault
      window.location.reload()
    }
  } catch (e) {
    console.error('Failed to change vault:', e)
  }
}

async function cleanupOrphanedAssets() {
  if (!vaultPath.value || cleaningUp.value) return
  cleaningUp.value = true
  cleanupResult.value = null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const moved = await invoke<number>('cleanup_orphaned_assets', { vaultPath: vaultPath.value })
    if (moved === 0) {
      cleanupResult.value = 'No orphaned assets found'
    } else {
      cleanupResult.value = `Moved ${moved} file${moved > 1 ? 's' : ''} to assets/orphans/`
    }
  } catch (e) {
    console.error('Cleanup failed:', e)
    cleanupResult.value = `Error: ${e}`
  }
  cleaningUp.value = false
}
</script>

<style>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.settings-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border-input);
  border-radius: 12px;
  width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-dialog);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.settings-header h2 {
  font-size: 1.1em;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 0;
}

.settings-close {
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
}

.settings-close:hover {
  background: var(--bg-surface-hover);
  color: var(--text-muted);
}

.settings-body {
  padding: 8px 24px 24px;
  overflow-y: auto;
}

.settings-section {
  padding: 16px 0;
}

.settings-section + .settings-section {
  border-top: 1px solid var(--border-subtle);
}

.settings-section h3 {
  font-size: 0.75em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 14px;
}

.setting-row {
  margin-bottom: 16px;
}

.setting-row:last-child {
  margin-bottom: 0;
}

.setting-row > label {
  display: block;
  font-size: 0.85em;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.vault-path-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.vault-path {
  flex: 1;
  font-size: 0.8em;
  color: var(--text-muted);
  background: var(--bg-input);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

.cleanup-result {
  font-size: 0.8em;
  color: var(--text-muted);
}

.btn-small {
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-main);
  color: var(--text-muted);
  padding: 6px 14px;
  font-size: 0.8em;
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
}

.btn-small:hover {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-color: var(--border-input-focus);
}

.scale-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scale-control input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-main);
  border-radius: 2px;
  outline: none;
}

.scale-control input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-text);
  cursor: pointer;
  border: none;
}

.scale-value {
  font-size: 0.82em;
  color: var(--text-muted);
  min-width: 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.font-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.font-input {
  background: var(--bg-input);
  border: 1px solid var(--border-main);
  color: var(--text-secondary);
  padding: 8px 12px;
  font-size: 0.85em;
  border-radius: 6px;
  outline: none;
  width: 100%;
}

.font-input:focus {
  border-color: var(--border-input-focus);
}

.font-input::placeholder {
  color: var(--text-faint);
}

.font-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.font-loading {
  color: var(--text-faint);
  font-size: 0.78em;
  padding: 8px 0;
}

.font-preset-btn {
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-input);
  color: var(--text-muted);
  padding: 5px 12px;
  font-size: 0.78em;
  cursor: pointer;
  border-radius: 5px;
  transition: all 0.12s ease;
}

.font-preset-btn:hover {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-color: var(--border-input-focus);
}

.font-preset-btn.active {
  background: var(--accent-bg);
  border-color: var(--accent);
  color: var(--accent-text);
}

/* Theme picker */
.theme-picker {
  display: flex;
  gap: 10px;
}

.theme-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.theme-swatch:hover {
  border-color: var(--border-main);
}

.theme-swatch.active {
  border-color: var(--accent);
}

.swatch-preview {
  width: 64px;
  height: 40px;
  border-radius: 4px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px;
}

.swatch-dot {
  width: 16px;
  height: 10px;
  border-radius: 2px;
}

.swatch-label {
  font-size: 0.72em;
  color: var(--text-muted);
}
</style>
