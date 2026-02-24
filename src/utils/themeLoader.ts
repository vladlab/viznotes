/**
 * Loads user theme overrides from ~/.config/com.viznotes.app/theme.css
 * Creates a documented default file if it doesn't exist.
 */

const DEFAULT_THEME_CSS = `/*
 * vizNotes — Theme Overrides
 *
 * Edit this file to customize colors. Changes take effect on app restart.
 * Uncomment any line below and change the value to override.
 *
 * The app has two built-in themes: "dark" and "paper".
 * Use [data-theme="dark"] { ... } or [data-theme="paper"] { ... }
 * to target a specific theme. Use :root { ... } to apply to both.
 */


/* ── Dark theme overrides ── */

/*
[data-theme="dark"] {
  --text-primary: #e0e0e0;
  --bg-app: #1a1a1a;
  --bg-canvas: #1a1a1a;
  --bg-sidebar: #222;

  --note-grey: #4a4a4a;
  --note-red: #e03131;
  --note-orange: #e8590c;
  --note-yellow: #f08c00;
  --note-green: #2f9e44;
  --note-cyan: #0c8599;
  --note-blue: #1971c2;
  --note-purple: #7048e8;
  --note-pink: #c2255c;
}
*/


/* ── Paper theme overrides ── */

/*
[data-theme="paper"] {
  --text-primary: #2c2c2c;
  --bg-app: #ddd6c8;
  --bg-canvas: #d5cec0;
  --bg-sidebar: #d0c9bb;

  --note-grey: #8a8478;
  --note-red: #c92a2a;
  --note-orange: #d9480f;
  --note-yellow: #e67700;
  --note-green: #2b8a3e;
  --note-cyan: #0b7285;
  --note-blue: #1864ab;
  --note-purple: #5f3dc4;
  --note-pink: #a61e4d;
}
*/
`

let styleEl: HTMLStyleElement | null = null

export async function loadUserTheme(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const configDir: string = await invoke('get_config_dir')
    const themePath = `${configDir}/theme.css`

    // Create default file if it doesn't exist
    const exists: boolean = await invoke('path_exists', { path: themePath })
    if (!exists) {
      await invoke('write_text_file', { path: themePath, contents: DEFAULT_THEME_CSS })
      console.log('[theme] Created default theme.css at', themePath)
      return // nothing to apply yet
    }

    // Read and inject
    const css: string = await invoke('read_text_file', { path: themePath })
    if (!css.trim()) return

    // Remove old injection if reloading
    if (styleEl) styleEl.remove()

    styleEl = document.createElement('style')
    styleEl.id = 'viznotes-user-theme'
    styleEl.textContent = css
    document.head.appendChild(styleEl)
    console.log('[theme] Loaded user theme overrides from', themePath)
  } catch (e) {
    console.warn('[theme] Failed to load user theme:', e)
  }
}
