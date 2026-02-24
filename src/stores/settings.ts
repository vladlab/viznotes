/**
 * Settings store — persists to Tauri config.
 */

import { reactive, watch } from 'vue'

export interface AppSettings {
  uiScale: number
  contentScale: number
  fontFamily: string
  scrollMode: 'touchpad' | 'mouse'
  theme: 'dark' | 'paper'
}

const defaults: AppSettings = {
  uiScale: 1.0,
  contentScale: 1.0,
  fontFamily: '',
  scrollMode: 'touchpad',
  theme: 'dark',
}

export const settings = reactive<AppSettings>({ ...defaults })

let loaded = false

/** Apply settings to the DOM */
function applySettings() {
  const root = document.documentElement
  root.style.fontSize = `${settings.uiScale * 100}%`
  root.style.setProperty('--content-scale', `${settings.contentScale}`)
  root.setAttribute('data-theme', settings.theme)

  if (settings.fontFamily) {
    root.style.setProperty('--app-font', `"${settings.fontFamily}", -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', sans-serif`)
  } else {
    root.style.removeProperty('--app-font')
  }
}

/** Load settings from Tauri config */
export async function loadSettings(): Promise<void> {
  if (loaded) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke<string | null>('get_settings')
    if (raw) {
      Object.assign(settings, JSON.parse(raw))
    }
  } catch (e) {
    console.warn('[settings] Failed to load:', e)
  }
  loaded = true
  applySettings()

  // Watch for changes and persist + apply
  watch(() => ({ ...settings }), async () => {
    applySettings()
    await saveSettings()
  }, { deep: true })
}

async function saveSettings(): Promise<void> {
  const data = JSON.stringify({ uiScale: settings.uiScale, contentScale: settings.contentScale, fontFamily: settings.fontFamily, scrollMode: settings.scrollMode, theme: settings.theme })
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_settings', { settings: data })
  } catch (e) {
    console.warn('[settings] Failed to save:', e)
  }
}
