import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { fetchTemplateCategories, listTemplate, TEMPLATE_LISTING_FEE, uploadDesignPackage, uploadTemplateImage } from '../../lib/marketplace'
import { Check, Loader2, Store, X } from '../ui/icons'

/**
 * Sell what you made, editable, on the Spyda marketplace. The buyer gets the
 * design itself (a flyer with its layers, or a video project with its clips,
 * titles and music) and opens their own copy in the editor.
 */
export default function SellDesignDialog({ kind, defaultName, makePreview, makePackage, onClose }: {
  kind: 'flyer' | 'video'
  defaultName: string
  /** The cover buyers see: the flyer, or a frame of the video. */
  makePreview: () => Promise<Blob>
  /** The editable design and every file it uses. */
  makePackage: () => Promise<Blob>
  onClose: () => void
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fallback = kind === 'flyer' ? 'Editable Flyer' : 'Video Template'
  const [categories, setCategories] = useState<string[]>([fallback])
  const [name, setName] = useState(defaultName.replace(/^Untitled /i, '').replace(/ · Page \d+$/, '') || defaultName)
  const [category, setCategory] = useState(fallback)
  const [price, setPrice] = useState('50')
  const [description, setDescription] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [step, setStep] = useState<'form' | 'working' | 'done'>('form')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let url: string | null = null
    makePreview().then(blob => { url = URL.createObjectURL(blob); setPreview(url); setPreviewBlob(blob) }).catch(() => setError('The cover could not be made. Try again in a moment.'))
    fetchTemplateCategories().then(list => setCategories(Array.from(new Set([fallback, ...list])))).catch(() => undefined)
    return () => { if (url) URL.revokeObjectURL(url) }
    // The preview is made once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && step !== 'working') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, step])

  const priceValue = Math.round(Number(price))
  const valid = name.trim().length > 0 && category.trim().length > 0 && Number.isFinite(priceValue) && priceValue >= 0 && priceValue <= 1_000_000 && previewBlob

  const submit = async () => {
    if (!user?.id) { setError('Sign in to sell on the marketplace.'); return }
    if (!valid || !previewBlob) return
    setError('')
    setStep('working')
    try {
      setProgress('Packing your design and its files…')
      const pkg = await makePackage()
      setProgress('Uploading the cover…')
      const type = previewBlob.type || 'image/png'
      const cover = await uploadTemplateImage(user.id, new File([previewBlob], `cover.${type.includes('jpeg') ? 'jpg' : 'png'}`, { type }))
      setProgress(`Uploading the design (${Math.max(1, Math.round(pkg.size / 1024 / 1024))} MB)…`)
      const file = await uploadDesignPackage(user.id, pkg)
      setProgress('Listing it…')
      await listTemplate({
        name: name.trim(), category: category.trim(), price: priceValue, description: description.trim(),
        imageUrl: cover.url, imagePath: cover.path,
        kind: kind === 'flyer' ? 'flyer' : 'motion', editable: true, filePath: file.path, fileType: file.type,
      })
      setStep('done')
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'The design could not be listed.'
      setError(/p_editable|function .*does not exist|schema cache/i.test(message)
        ? 'Selling editable designs needs the latest Spyda database update (20261125000000_marketplace_editable_designs.sql). Apply it in Supabase, then try again.'
        : message)
      setStep('form')
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && step !== 'working') onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Sell on the marketplace" className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#15161a]/95 text-foreground shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]" onKeyDown={event => event.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3.5">
          <Store className="h-4 w-4 text-primary" />
          <h2 className="text-[14px] font-semibold">Sell on the marketplace</h2>
          <button type="button" onClick={onClose} disabled={step === 'working'} aria-label="Close" className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30"><X className="h-4 w-4" /></button>
        </div>

        {step === 'done' ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary"><Check className="h-6 w-6" /></span>
            <p className="text-[15px] font-semibold">“{name.trim()}” is on the marketplace</p>
            <p className="max-w-sm text-[12px] leading-5 text-muted-foreground">Buyers get an editable copy that opens in the {kind === 'flyer' ? 'canvas' : 'video editor'}. {priceValue > 0 ? `You earn ${priceValue.toLocaleString()} credits each time someone buys it.` : 'It is free, so anyone can get it: a good way to be found.'}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={onClose} className="h-9 rounded-lg border border-white/[0.1] px-4 text-[12px] font-semibold hover:bg-white/[0.06]">Keep editing</button>
              <button type="button" onClick={() => navigate('/workspace?view=templates')} className="h-9 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground">See it in the marketplace</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 p-5 sm:grid-cols-[180px_1fr]">
            <div>
              <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[repeating-conic-gradient(#1c1d21_0%_25%,#141518_0%_50%)] bg-[length:14px_14px]">
                {preview ? <img src={preview} alt="Cover buyers will see" className="h-full w-full object-contain" /> : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">The cover buyers see. They get the {kind === 'flyer' ? 'full design with every layer' : 'whole project: clips, titles, music and effects'}.</p>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground">Name</span>
                <input value={name} onChange={event => setName(event.target.value)} maxLength={80} className="mt-1 h-9 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 text-[13px] outline-none focus:border-primary/50" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground">Category</span>
                <input list="sell-categories" value={category} onChange={event => setCategory(event.target.value)} maxLength={40} className="mt-1 h-9 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 text-[13px] outline-none focus:border-primary/50" />
                <datalist id="sell-categories">{categories.map(item => <option key={item} value={item} />)}</datalist>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground">Price in Spyda credits</span>
                <div className="mt-1 flex items-center gap-2">
                  <input inputMode="numeric" value={price} onChange={event => setPrice(event.target.value.replace(/[^0-9]/g, ''))} className="h-9 w-28 rounded-lg border border-white/[0.08] bg-black/30 px-3 text-[13px] tabular-nums outline-none focus:border-primary/50" />
                  {[0, 25, 50, 100, 250].map(value => (
                    <button key={value} type="button" onClick={() => setPrice(String(value))} className={`h-7 rounded-md px-2 text-[11px] ${priceValue === value ? 'bg-primary/15 text-primary' : 'bg-white/[0.04] text-muted-foreground hover:text-foreground'}`}>{value === 0 ? 'Free' : value}</button>
                  ))}
                </div>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground">Description <span className="font-normal">(optional)</span></span>
                <textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} maxLength={400} placeholder={kind === 'flyer' ? 'What it is for, and what buyers can change' : 'What it is for, its length and its size'} className="mt-1 w-full resize-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12px] outline-none focus:border-primary/50" />
              </label>
              <p className="text-[10px] leading-4 text-muted-foreground">Listing costs {TEMPLATE_LISTING_FEE} credits. Only sell work that is yours: pictures, logos, music and fonts you have the right to share.</p>
              {error ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11px] leading-4 text-red-200">{error}</p> : null}
              <button type="button" onClick={() => { void submit() }} disabled={!valid || step === 'working'} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground disabled:opacity-50">
                {step === 'working' ? <><Loader2 className="h-4 w-4 animate-spin" /> {progress}</> : <><Store className="h-4 w-4" /> List for {priceValue > 0 ? `${priceValue.toLocaleString()} credits` : 'free'}</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
