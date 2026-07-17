import { useEffect, useState } from 'react'
import { Download, Share, Plus, X, SquarePlus } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    // iPadOS 13+ reports as Mac; detect the touch capability instead.
    || (/macintosh/i.test(navigator.userAgent) && 'ontouchend' in document)
}

export default function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone())
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setDeferred(null); setShowHelp(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' as const }))
      if (choice.outcome === 'accepted') setInstalled(true)
      setDeferred(null)
      return
    }
    // No native prompt (iOS Safari, or criteria not yet met) — show manual steps.
    setShowHelp(true)
  }

  const ios = isIos()

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="group flex w-full items-center gap-2.5 rounded-[6px] border border-primary/25 bg-primary/[0.08] px-2.5 py-[7px] text-primary transition-colors hover:bg-primary/[0.14]"
      >
        <Download className="h-[16px] w-[16px]" strokeWidth={1.5} />
        <span className="text-[13px] font-medium tracking-wide">Install app</span>
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Install Spyda">
          <div className="w-full max-w-md rounded-t-2xl border border-white/[0.08] bg-[#0c0d0f] p-5 sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Download className="h-4 w-4" /></span>
                <h3 className="font-heading text-lg font-semibold">Install Spyda</h3>
              </div>
              <button type="button" onClick={() => setShowHelp(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {ios ? (
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p>Add Spyda to your home screen from Safari:</p>
                <ol className="space-y-3">
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-foreground">1</span><span className="flex items-center gap-1.5">Tap the <Share className="h-4 w-4 text-primary" /> <b className="text-foreground">Share</b> button</span></li>
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-foreground">2</span><span className="flex items-center gap-1.5">Choose <SquarePlus className="h-4 w-4 text-primary" /> <b className="text-foreground">Add to Home Screen</b></span></li>
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-foreground">3</span><span>Tap <b className="text-foreground">Add</b> — Spyda opens like a native app.</span></li>
                </ol>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p>Your browser hasn't offered the install prompt yet. You can still install Spyda manually:</p>
                <ol className="space-y-3">
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-foreground">1</span><span>Open the browser menu (⋮ or the <Plus className="inline h-4 w-4 text-primary" /> install icon in the address bar).</span></li>
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-foreground">2</span><span>Choose <b className="text-foreground">Install app</b> or <b className="text-foreground">Add to Home screen</b>.</span></li>
                  <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-foreground">3</span><span>Confirm to add Spyda to your device.</span></li>
                </ol>
                <p className="text-xs">Tip: install works over HTTPS after the page has fully loaded once.</p>
              </div>
            )}

            <button type="button" onClick={() => setShowHelp(false)} className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
