/**
 * Shared capture point for Chrome's `beforeinstallprompt` event.
 *
 * Chrome fires the event ONCE, usually right after page load — which is while
 * Spyda's splash screen is still up and before any React component has mounted
 * its listeners. If nobody catches it, the in-app "Install app" buttons can
 * never trigger the native install dialog. `setupInstallPromptCapture()` runs
 * at module-evaluation time from main.tsx so the event is always stashed here,
 * and components subscribe to INSTALL_AVAILABLE_EVENT / INSTALL_COMPLETED_EVENT
 * to stay in sync.
 *
 * We deliberately do NOT call event.preventDefault(): that keeps Chrome's own
 * install surfaces (the omnibox install icon on desktop and the automatic
 * install prompt on Android) available alongside our buttons.
 */

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const INSTALL_AVAILABLE_EVENT = 'spyda-install-available'
export const INSTALL_COMPLETED_EVENT = 'spyda-install-completed'

let stashedPrompt: InstallPromptEvent | null = null

export function setupInstallPromptCapture() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', event => {
    stashedPrompt = event as InstallPromptEvent
    window.dispatchEvent(new CustomEvent(INSTALL_AVAILABLE_EVENT))
  })
  window.addEventListener('appinstalled', () => {
    stashedPrompt = null
    window.dispatchEvent(new CustomEvent(INSTALL_COMPLETED_EVENT))
  })
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return stashedPrompt
}

export function clearInstallPrompt() {
  stashedPrompt = null
}
