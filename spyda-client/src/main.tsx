import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
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
