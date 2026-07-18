import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupInstallPromptCapture } from './lib/pwa-install'

// Capture Chrome's one-shot beforeinstallprompt event before the splash screen
// delays React mounting — otherwise the in-app Install buttons miss it.
setupInstallPromptCapture()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(registration => registration.update())
        .catch((error) => {
          console.warn('Spyda service worker registration failed:', error)
        })
    })
  } else {
    // In dev the PWA shell cache serves stale code — make sure it's gone.
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) registration.unregister()
    })
    if ('caches' in window) {
      caches.keys().then(keys => { for (const key of keys) caches.delete(key) })
    }
  }
}
