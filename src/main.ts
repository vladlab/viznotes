import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// Prevent native webview zoom from pinch-to-zoom (trackpad) and Ctrl+wheel.
// Pinch gestures are translated to wheel events with ctrlKey=true by the browser.
// Without this, the webview intercepts them for native page zoom before the
// canvas wheel handler can use them for canvas zoom.
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
  }
}, { passive: false })

createApp(App).mount('#app')
