import type { StorageBackend } from './interface'

export async function getVaultPath(): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string | null>('get_vault_path')
}

export async function setVaultPath(vaultPath: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('set_vault_path', { vaultPath })
}

export async function createFileStorage(vaultPath: string): Promise<StorageBackend> {
  const { FileStorage } = await import('./file')
  const storage = new FileStorage(vaultPath)
  await storage.init()
  console.log(`[storage] FileStorage initialized at: ${vaultPath}`)
  return storage
}
