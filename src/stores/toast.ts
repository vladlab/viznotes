/**
 * Simple shared toast notification.
 * Any component can show a toast; the nearest toast renderer displays it.
 */

import { ref } from 'vue'

export const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

export function showToast(msg: string, duration = 2000) {
  toastMessage.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  if (duration > 0) {
    toastTimer = setTimeout(() => { toastMessage.value = '' }, duration)
  }
}

export function clearToast() {
  toastMessage.value = ''
  if (toastTimer) clearTimeout(toastTimer)
}
