export async function showInFolder(path: string): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('show_in_folder', { path })
    return true
  } catch (e) {
    console.error('showInFolder failed:', e)
    return false
  }
}

export async function openExternal(url: string): Promise<void> {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch {
    window.open(url, '_blank')
  }
}

export function isLocalPath(link: string): boolean {
  return link.startsWith('file:///') || link.startsWith('/') || /^[A-Z]:[\\\/]/.test(link)
}

export function toFsPath(link: string): string {
  return link.startsWith('file:///') ? link.slice(7) : link
}
