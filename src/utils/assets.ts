/**
 * Asset management utilities.
 * Saves images to the vault's assets/ directory and resolves them to data URLs.
 */

import { nanoid } from 'nanoid'

let _invoke: any = null

async function getInvoke() {
  if (!_invoke) {
    const mod = await import('@tauri-apps/api/core')
    _invoke = mod.invoke
  }
  return _invoke
}

// Cache resolved data URLs so we don't re-read files on every render
const urlCache = new Map<string, string>()

/**
 * Guess MIME type from file extension.
 */
function mimeFromExt(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'svg': return 'image/svg+xml'
    case 'bmp': return 'image/bmp'
    default: return 'image/png'
  }
}

/**
 * Save pasted image data to the vault's assets directory.
 * @param vaultPath - Absolute path to the vault
 * @param base64Data - Base64-encoded image data (no data: prefix)
 * @param extension - File extension (e.g. 'png', 'jpg')
 * @returns The asset filename (e.g. 'a1b2c3d4.png')
 */
export async function saveImageAsset(
  vaultPath: string,
  base64Data: string,
  extension: string,
): Promise<string> {
  const invoke = await getInvoke()
  const filename = `${nanoid(12)}.${extension}`
  await invoke('save_asset', { vaultPath, filename, base64Data })

  // Pre-cache the data URL since we already have the base64
  const mime = mimeFromExt(filename)
  urlCache.set(`${vaultPath}/${filename}`, `data:${mime};base64,${base64Data}`)

  return filename
}

/**
 * Resolve an asset filename to a displayable data URL.
 * Reads the file via Rust and returns a data: URL. Results are cached.
 */
export async function resolveAssetUrl(vaultPath: string, filename: string): Promise<string> {
  const cacheKey = `${vaultPath}/${filename}`
  const cached = urlCache.get(cacheKey)
  if (cached) return cached

  const invoke = await getInvoke()
  const base64 = await invoke('read_asset', { vaultPath, filename })
  const mime = mimeFromExt(filename)
  const dataUrl = `data:${mime};base64,${base64}`
  urlCache.set(cacheKey, dataUrl)
  return dataUrl
}
