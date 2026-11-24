import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { MediaItem } from '../../lib/video/timeline'
import { BUNDLED_FAMILIES, previewFamily } from '../../lib/fonts'
import {
  ASPECTS, NEUTRAL_ADJUST, NEW_EDIT, PHOTO_FILTERS, autoEnhance, geometryCanvas, renderPhoto,
  type Adjust, type PhotoEdit, type PhotoShape, type PhotoText,
} from '../../lib/photo-edit'
import { Image as ImageIcon, Loader2, Plus, Redo2, Trash2, Undo2, Upload, Wand2 } from '../ui/icons'

/**
 * The Photo page: edit the pictures in your media without leaving the
 * studio. Adjust, filters, crop and rotate, text, elements and background
 * removal, then save the result as a new photo (the original is kept) and,
 * if you like, put it straight into the edit.
 */

type Tool = 'adjust' | 'filters' | 'crop' | 'text' | 'elements' | 'background'
type Selected = { kind: 'text' | 'shape'; id: string } | null
type SaveTo = 'library' | 'end' | 'top'

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'adjust', label: 'Adjust' }, { id: 'filters', label: 'Filters' }, { id: 'crop', label: 'Crop & rotate' },
  { id: 'text', label: 'Text' }, { id: 'elements', label: 'Elements' }, { id: 'background', label: 'Background' },
]
const ADJUSTMENTS: Array<{ key: keyof Adjust; label: string; min: number; max: number }> = [
  { key: 'brightness', label: 'Brightness', min: -1, max: 1 }, { key: 'contrast', label: 'Contrast', min: -1, max: 1 },
  { key: 'highlights', label: 'Highlights', min: -1, max: 1 }, { key: 'shadows', label: 'Shadows', min: -1, max: 1 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1 }, { key: 'vibrance', label: 'Vibrance', min: -1, max: 1 },
  { key: 'warmth', label: 'Warmth', min: -1, max: 1 }, { key: 'tint', label: 'Tint', min: -1, max: 1 },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 1 }, { key: 'blur', label: 'Blur', min: 0, max: 1 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1 }, { key: 'fade', label: 'Fade', min: 0, max: 1 },
  { key: 'grain', label: 'Grain', min: 0, max: 1 },
]
const STICKERS = ['★', '❤️', '🔥', '✨', '😎', '👍', '🎉', '💯', '⚡', '✅', '📍', '🎵', '👑', '💥', '🌟', '➡️']

// Edits stay for the visit, per photo, while you move between pages.
const edits = new Map<string, PhotoEdit>()
const cutouts = new Map<string, HTMLCanvasElement>()
let nextId = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(nextId++).toString(36)}`
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

function Range({ label, value, min, max, step = 0.01, onChange, reset = 0, format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; reset?: number; format?: (value: number) => string }) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="w-[72px] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} onDoubleClick={() => onChange(reset)} className="min-w-0 flex-1 accent-[#9dfab0]" aria-label={label} />
      <span className="w-9 text-right font-mono text-foreground/80">{format ? format(value) : Math.round(value * 100)}</span>
    </label>
  )
}

export default function PhotoPage({ photos, onSave, onImport }: { photos: MediaItem[]; onSave: (file: File, to: SaveTo) => Promise<void>; onImport: () => void }) {
  const [photoId, setPhotoId] = useState<string | null>(photos[0]?.id ?? null)
  const photo = photos.find(item => item.id === photoId) ?? photos[0] ?? null
  const [edit, setEditState] = useState<PhotoEdit>(() => (photo ? edits.get(photo.id) ?? structuredClone(NEW_EDIT) : structuredClone(NEW_EDIT)))
  const history = useRef<{ past: PhotoEdit[]; future: PhotoEdit[] }>({ past: [], future: [] })
  const [tool, setTool] = useState<Tool>('adjust')
  const [selected, setSelected] = useState<Selected>(null)
  const [source, setSource] = useState<HTMLImageElement | HTMLCanvasElement | null>(null)
  const [aspect, setAspect] = useState<string>('free')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const display = useRef<HTMLCanvasElement | null>(null)
  const [frame, setFrame] = useState({ width: 1, height: 1 })
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  // Switching photo: its own edit and its own picture (cut out, if the background was removed).
  useEffect(() => {
    if (!photo) { setSource(null); return }
    setEditState(edits.get(photo.id) ?? structuredClone(NEW_EDIT))
    history.current = { past: [], future: [] }
    setSelected(null)
    const cut = cutouts.get(photo.id)
    if (cut) { setSource(cut); return }
    const image = new Image()
    image.onload = () => setSource(image)
    image.src = photo.url
  }, [photo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const setEdit = useCallback((update: (current: PhotoEdit) => PhotoEdit, record = true) => {
    setEditState(current => {
      const next = update(current)
      if (record) { history.current.past.push(current); if (history.current.past.length > 80) history.current.past.shift(); history.current.future = [] }
      if (photo) edits.set(photo.id, next)
      return next
    })
  }, [photo])
  const undo = () => { const previous = history.current.past.pop(); if (!previous) return; history.current.future.push(edit); setEditState(previous); if (photo) edits.set(photo.id, previous) }
  const redo = () => { const next = history.current.future.pop(); if (!next) return; history.current.past.push(edit); setEditState(next); if (photo) edits.set(photo.id, next) }

  // Draw: the finished photo, or in Crop the whole picture with the crop box over it.
  useEffect(() => {
    const canvas = display.current
    if (!canvas || !source) return
    let frameId = requestAnimationFrame(() => {
      const shown = tool === 'crop' ? geometryCanvas(source as HTMLImageElement, edit, 1100) : renderPhoto(source, edit, 1100)
      canvas.width = shown.width
      canvas.height = shown.height
      canvas.getContext('2d')!.drawImage(shown, 0, 0)
      setFrame({ width: shown.width, height: shown.height })
      frameId = 0
    })
    return () => { if (frameId) cancelAnimationFrame(frameId) }
  }, [edit, source, tool])

  // Filter swatches: this photo through each filter, small.
  useEffect(() => {
    if (!source || tool !== 'filters') return
    const next: Record<string, string> = {}
    for (const filter of PHOTO_FILTERS) {
      const small = renderPhoto(source, { ...edit, texts: [], shapes: [], adjust: { ...NEUTRAL_ADJUST, ...filter.adjust } }, 140)
      next[filter.id] = small.toDataURL('image/jpeg', 0.7)
    }
    setThumbs(next)
  }, [source, tool, edit.rotate, edit.straighten, edit.flipX, edit.flipY, edit.crop]) // eslint-disable-line react-hooks/exhaustive-deps

  const setAdjust = (key: keyof Adjust, value: number) => setEdit(current => ({ ...current, filter: 'custom', adjust: { ...current.adjust, [key]: value } }), false)
  /** Before a slider or colour drag: one undo step for the whole drag. */
  const snapshot = () => { history.current.past.push(edit); if (history.current.past.length > 80) history.current.past.shift(); history.current.future = [] }
  const sourceAspect = useMemo(() => {
    if (!source) return 1
    const w = (source as HTMLImageElement).naturalWidth || source.width, h = (source as HTMLImageElement).naturalHeight || source.height
    return edit.rotate === 90 || edit.rotate === 270 ? h / w : w / h
  }, [source, edit.rotate])

  /** Sets the crop box to an aspect ratio, as large as fits, centred. */
  const applyAspect = (id: string) => {
    setAspect(id)
    const target = ASPECTS.find(item => item.id === id)
    if (!target || target.ratio == null) return
    const ratio = target.ratio === 0 ? sourceAspect : target.ratio
    let width = 1, height = sourceAspect / ratio
    if (height > 1) { width = 1 / height; height = 1 }
    setEdit(current => ({ ...current, crop: { x: (1 - width) / 2, y: (1 - height) / 2, width, height } }))
  }

  const dragCrop = (event: ReactPointerEvent, handle: 'move' | 'nw' | 'ne' | 'sw' | 'se') => {
    event.preventDefault(); event.stopPropagation()
    const box = (event.currentTarget.closest('[data-stage]') as HTMLElement).getBoundingClientRect()
    const start = { ...edit.crop }, x0 = event.clientX, y0 = event.clientY
    const target = ASPECTS.find(item => item.id === aspect)
    const ratio = target?.ratio == null ? null : (target.ratio === 0 ? sourceAspect : target.ratio) / sourceAspect
    history.current.past.push(edit)
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - x0) / box.width, dy = (moveEvent.clientY - y0) / box.height
      let { x, y, width, height } = start
      if (handle === 'move') { x = clamp(start.x + dx, 0, 1 - width); y = clamp(start.y + dy, 0, 1 - height) }
      else {
        const left = handle === 'nw' || handle === 'sw', top = handle === 'nw' || handle === 'ne'
        let right = start.x + start.width, bottom = start.y + start.height
        if (left) x = clamp(start.x + dx, 0, right - 0.05); else right = clamp(right + dx, x + 0.05, 1)
        if (top) y = clamp(start.y + dy, 0, bottom - 0.05); else bottom = clamp(bottom + dy, y + 0.05, 1)
        width = right - x; height = bottom - y
        if (ratio) { height = Math.min(width / ratio, top ? start.y + start.height : 1 - y); width = height * ratio; if (left) x = start.x + start.width - width; if (top) y = start.y + start.height - height }
      }
      setEdit(current => ({ ...current, crop: { x, y, width, height } }), false)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Text and elements are dragged around on the photo; the corner handle resizes an element. */
  const dragItem = (event: ReactPointerEvent, kind: 'text' | 'shape', id: string, resize = false) => {
    event.preventDefault(); event.stopPropagation()
    setSelected({ kind, id })
    const box = (event.currentTarget.closest('[data-stage]') as HTMLElement).getBoundingClientRect()
    const item = kind === 'text' ? edit.texts.find(entry => entry.id === id) : edit.shapes.find(entry => entry.id === id)
    if (!item) return
    const start = { ...item } as PhotoText & PhotoShape
    const x0 = event.clientX, y0 = event.clientY
    history.current.past.push(edit)
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - x0) / box.width, dy = (moveEvent.clientY - y0) / box.height
      setEdit(current => kind === 'text'
        ? { ...current, texts: current.texts.map(entry => (entry.id === id ? { ...entry, x: clamp(start.x + dx), y: clamp(start.y + dy) } : entry)) }
        : { ...current, shapes: current.shapes.map(entry => (entry.id === id ? (resize ? { ...entry, width: clamp(start.width + dx * 2, 0.02, 2), height: clamp(start.height + dy * 2, 0.01, 2) } : { ...entry, x: clamp(start.x + dx), y: clamp(start.y + dy) }) : entry)) }, false)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const addText = () => {
    const text: PhotoText = { id: newId('text'), text: 'Your text', x: 0.5, y: 0.5, size: 0.08, color: '#ffffff', font: BUNDLED_FAMILIES[0]?.family ?? 'Inter', weight: 800, shadow: true, background: null }
    setEdit(current => ({ ...current, texts: [...current.texts, text] }))
    setSelected({ kind: 'text', id: text.id })
  }
  const addShape = (kind: PhotoShape['kind'], sticker?: string) => {
    const shape: PhotoShape = { id: newId('shape'), kind, x: 0.5, y: 0.5, width: kind === 'line' ? 0.5 : 0.25, height: kind === 'line' ? 0.012 : kind === 'sticker' ? 0.18 : 0.25 * Math.min(2, frame.width / frame.height), color: kind === 'sticker' ? '#ffffff' : '#9dfab0', opacity: 1, radius: kind === 'rect' ? 0.2 : 0, sticker }
    setEdit(current => ({ ...current, shapes: [...current.shapes, shape] }))
    setSelected({ kind: 'shape', id: shape.id })
  }
  const selectedText = selected?.kind === 'text' ? edit.texts.find(item => item.id === selected.id) ?? null : null
  const selectedShape = selected?.kind === 'shape' ? edit.shapes.find(item => item.id === selected.id) ?? null : null
  const updateText = (patch: Partial<PhotoText>, record = false) => selectedText && setEdit(current => ({ ...current, texts: current.texts.map(item => (item.id === selectedText.id ? { ...item, ...patch } : item)) }), record)
  const updateShape = (patch: Partial<PhotoShape>, record = false) => selectedShape && setEdit(current => ({ ...current, shapes: current.shapes.map(item => (item.id === selectedShape.id ? { ...item, ...patch } : item)) }), record)

  const removeBackground = async () => {
    if (!photo || !source) return
    setBusy('Removing the background… (the first time downloads the model once)')
    setMessage(null)
    try {
      const { segmentFlyer } = await import('../../lib/segmentation')
      const original = new Image()
      await new Promise<void>((resolve, reject) => { original.onload = () => resolve(); original.onerror = () => reject(new Error('unreadable')); original.src = photo.url })
      const matte = await segmentFlyer(photo.url)
      const cut = document.createElement('canvas')
      cut.width = original.naturalWidth; cut.height = original.naturalHeight
      const context = cut.getContext('2d')!
      context.drawImage(original, 0, 0)
      context.globalCompositeOperation = 'destination-in'
      context.drawImage(matte.canvas, 0, 0, cut.width, cut.height)
      cutouts.set(photo.id, cut)
      setSource(cut)
      setEdit(current => ({ ...current }))
      setMessage('Background removed. Pick a colour behind it, or keep it see-through.')
    } catch (error) {
      setMessage(error instanceof Error ? `The background could not be removed: ${error.message}` : 'The background could not be removed.')
    } finally {
      setBusy(null)
    }
  }
  const restoreBackground = () => {
    if (!photo) return
    cutouts.delete(photo.id)
    const image = new Image()
    image.onload = () => setSource(image)
    image.src = photo.url
    setEdit(current => ({ ...current, backdrop: null }))
  }

  const save = async (to: SaveTo) => {
    if (!photo || !source) return
    setBusy('Saving at full quality…')
    try {
      const full = renderPhoto(source, edit, 4096)
      const blob = await new Promise<Blob | null>(resolve => full.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('The photo could not be saved.')
      await onSave(new File([blob], `${photo.name} (edited).png`, { type: 'image/png' }), to)
      setMessage(to === 'library' ? 'Saved as a new photo in your media. The original is unchanged.' : to === 'end' ? 'Saved and added to the end of your edit.' : 'Saved and put on top at the playhead.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The photo could not be saved.')
    } finally {
      setBusy(null)
    }
  }

  if (!photos.length) {
    return (
      <div className="mac-workspace flex min-h-0 flex-1 items-center justify-center">
        <button type="button" onClick={onImport} className="flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-dashed border-white/[0.14] px-10 py-12 text-center hover:border-primary/50">
          <ImageIcon className="h-7 w-7 text-primary" />
          <span className="text-[14px] font-semibold">Import a photo to edit it</span>
          <span className="text-[11px] leading-5 text-muted-foreground">Adjust, filters, crop, text, elements and background removal. The photos in your media show here.</span>
        </button>
      </div>
    )
  }

  const crop = edit.crop
  return (
    <div className="mac-workspace flex min-h-0 flex-1">
      {/* Photos */}
      <aside className="mac-sidebar flex w-[200px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#111214] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-semibold">Photos</p>
          <button type="button" onClick={onImport} aria-label="Import photos" title="Import photos" className="rounded p-1 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"><Upload className="h-3.5 w-3.5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {photos.map(item => (
            <button key={item.id} type="button" onClick={() => setPhotoId(item.id)} title={item.name} className={`overflow-hidden rounded-lg border-2 ${photo?.id === item.id ? 'border-primary' : 'border-transparent hover:border-white/25'}`}>
              {item.thumbnail ? <img src={item.thumbnail} alt="" className="aspect-square w-full bg-black object-cover" /> : <span className="block aspect-square bg-white/[0.05]" />}
              {edits.has(item.id) ? <span className="block bg-primary/20 text-[8px] font-semibold text-primary">Edited</span> : null}
            </button>
          ))}
        </div>
      </aside>

      {/* Stage */}
      <section className="mac-window flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-white/[0.06] px-3">
          <p className="min-w-0 flex-1 truncate text-[12px] font-semibold">{photo?.name}</p>
          <button type="button" onClick={undo} aria-label="Undo" title="Undo" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/[0.08]"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} aria-label="Redo" title="Redo" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/[0.08]"><Redo2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setEdit(() => structuredClone(NEW_EDIT)); setAspect('free') }} className="h-8 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground">Reset all</button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[repeating-conic-gradient(#17181c_0%_25%,#111215_0%_50%)] bg-[length:18px_18px] p-6" onPointerDown={() => setSelected(null)}>
          <div data-stage className="relative max-h-full max-w-full" style={{ aspectRatio: `${frame.width} / ${frame.height}`, height: frame.width / frame.height < 1.4 ? '100%' : undefined, width: frame.width / frame.height >= 1.4 ? '100%' : undefined }}>
            <canvas ref={display} className="h-full w-full rounded shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]" aria-label="Photo being edited" />
            {tool === 'crop' ? (
              <>
                <div className="pointer-events-none absolute inset-0 bg-black/55" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${crop.y * 100}%, ${crop.x * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${(crop.y + crop.height) * 100}%, ${(crop.x + crop.width) * 100}% ${(crop.y + crop.height) * 100}%, ${(crop.x + crop.width) * 100}% ${crop.y * 100}%, 0 ${crop.y * 100}%)` }} />
                <div onPointerDown={event => dragCrop(event, 'move')} className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} aria-label="Crop box: drag to move">
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-white/25" />)}</div>
                  {(['nw', 'ne', 'sw', 'se'] as const).map(corner => (
                    <span key={corner} onPointerDown={event => dragCrop(event, corner)} className={`absolute h-4 w-4 rounded-sm border-2 border-white bg-primary ${corner.includes('n') ? '-top-2' : '-bottom-2'} ${corner.includes('w') ? '-left-2' : '-right-2'} ${corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}`} />
                  ))}
                </div>
              </>
            ) : (
              <>
                {edit.shapes.map(shape => (
                  <div key={shape.id} onPointerDown={event => dragItem(event, 'shape', shape.id)} className={`absolute cursor-move ${selected?.id === shape.id ? 'outline outline-2 outline-offset-2 outline-primary' : 'hover:outline hover:outline-1 hover:outline-white/50'}`} style={{ left: `${(shape.x - shape.width / 2) * 100}%`, top: `${(shape.y - shape.height / 2) * 100}%`, width: `${shape.width * 100}%`, height: `${shape.height * 100}%` }}>
                    {selected?.id === shape.id ? <span onPointerDown={event => dragItem(event, 'shape', shape.id, true)} className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-white bg-primary" title="Drag to resize" /> : null}
                  </div>
                ))}
                {edit.texts.map(text => (
                  <div key={text.id} onPointerDown={event => dragItem(event, 'text', text.id)} className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move rounded px-2 ${selected?.id === text.id ? 'outline outline-2 outline-primary' : 'hover:outline hover:outline-1 hover:outline-white/50'}`} style={{ left: `${text.x * 100}%`, top: `${text.y * 100}%`, height: `${text.size * 100 * Math.max(1, text.text.split('\n').length) * 1.2}%`, width: `${Math.min(100, text.size * 100 * (frame.height / frame.width) * Math.max(...text.text.split('\n').map(line => line.length)) * 0.6)}%` }} />
                ))}
              </>
            )}
          </div>
          {busy ? <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[12px]"><Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" /> {busy}</div> : null}
        </div>
        <div className="flex h-14 shrink-0 items-center gap-2 border-t border-white/[0.06] px-3">
          {message ? <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={message}>{message}</p> : <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">Your original stays untouched: saving makes a new photo.</p>}
          <button type="button" onClick={() => { void save('library') }} disabled={Boolean(busy)} className="h-9 rounded-lg border border-white/[0.1] px-3 text-[12px] font-semibold hover:bg-white/[0.06] disabled:opacity-50">Save as new photo</button>
          <button type="button" onClick={() => { void save('top') }} disabled={Boolean(busy)} className="h-9 rounded-lg border border-primary/30 bg-primary/[0.08] px-3 text-[12px] font-semibold text-primary hover:bg-primary/[0.15] disabled:opacity-50">Save & put on top</button>
          <button type="button" onClick={() => { void save('end') }} disabled={Boolean(busy)} className="h-9 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Save & add to edit</button>
        </div>
      </section>

      {/* Tools */}
      <aside className="mac-sidebar flex w-[300px] shrink-0 flex-col border-l border-white/[0.06] bg-[#111214]">
        <div role="tablist" aria-label="Photo tools" className="grid grid-cols-3 gap-1 border-b border-white/[0.06] p-2">
          {TOOLS.map(item => <button key={item.id} type="button" role="tab" aria-selected={tool === item.id} onClick={() => setTool(item.id)} className={`h-8 rounded-md text-[10px] font-semibold ${tool === item.id ? 'bg-primary text-primary-foreground' : 'bg-white/[0.04] text-muted-foreground hover:text-foreground'}`}>{item.label}</button>)}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {tool === 'adjust' ? (
            <>
              <button type="button" onClick={() => { const canvas = display.current; if (canvas) setEdit(current => ({ ...current, filter: 'custom', adjust: { ...current.adjust, ...autoEnhance(canvas) } })) }} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground"><Wand2 className="h-4 w-4" /> Auto enhance</button>
              <div onPointerDown={snapshot}>
                {ADJUSTMENTS.map(item => <Range key={item.key} label={item.label} value={edit.adjust[item.key]} min={item.min} max={item.max} onChange={value => setAdjust(item.key, value)} />)}
              </div>
              <p className="text-[9px] text-muted-foreground">Double-click a slider to reset it.</p>
            </>
          ) : tool === 'filters' ? (
            <div className="grid grid-cols-3 gap-1.5">
              {PHOTO_FILTERS.map(filter => (
                <button key={filter.id} type="button" onClick={() => setEdit(current => ({ ...current, filter: filter.id, adjust: { ...NEUTRAL_ADJUST, ...filter.adjust } }))} className={`overflow-hidden rounded-lg border-2 text-left ${edit.filter === filter.id ? 'border-primary' : 'border-transparent hover:border-white/25'}`}>
                  {thumbs[filter.id] ? <img src={thumbs[filter.id]} alt="" className="aspect-square w-full object-cover" /> : <span className="block aspect-square bg-white/[0.05]" />}
                  <span className="block truncate px-1 py-0.5 text-[9px] font-medium">{filter.name}</span>
                </button>
              ))}
            </div>
          ) : tool === 'crop' ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Shape</p>
              <div className="grid grid-cols-4 gap-1">
                {ASPECTS.map(item => <button key={item.id} type="button" onClick={() => applyAspect(item.id)} className={`h-8 rounded-md text-[10px] font-semibold ${aspect === item.id ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>{item.label}</button>)}
              </div>
              <p className="pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Rotate</p>
              <div className="grid grid-cols-4 gap-1">
                <button type="button" onClick={() => setEdit(current => ({ ...current, rotate: (((current.rotate + 270) % 360) as PhotoEdit['rotate']), crop: { x: 0, y: 0, width: 1, height: 1 } }))} className="h-8 rounded-md bg-white/[0.05] text-[11px] hover:bg-white/[0.1]" title="Turn left">↺ 90°</button>
                <button type="button" onClick={() => setEdit(current => ({ ...current, rotate: (((current.rotate + 90) % 360) as PhotoEdit['rotate']), crop: { x: 0, y: 0, width: 1, height: 1 } }))} className="h-8 rounded-md bg-white/[0.05] text-[11px] hover:bg-white/[0.1]" title="Turn right">↻ 90°</button>
                <button type="button" onClick={() => setEdit(current => ({ ...current, flipX: !current.flipX }))} className={`h-8 rounded-md text-[11px] ${edit.flipX ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>⇋ Flip</button>
                <button type="button" onClick={() => setEdit(current => ({ ...current, flipY: !current.flipY }))} className={`h-8 rounded-md text-[11px] ${edit.flipY ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05] hover:bg-white/[0.1]'}`}>⇵ Flip</button>
              </div>
              <div onPointerDown={snapshot}><Range label="Straighten" value={edit.straighten} min={-45} max={45} step={0.5} onChange={straighten => setEdit(current => ({ ...current, straighten }), false)} format={value => `${value.toFixed(1)}°`} /></div>
              <button type="button" onClick={() => { setEdit(current => ({ ...current, crop: { x: 0, y: 0, width: 1, height: 1 }, straighten: 0 })); setAspect('free') }} className="h-8 w-full rounded-md bg-white/[0.04] text-[10px] text-muted-foreground hover:text-foreground">Reset crop</button>
              <p className="text-[9px] leading-4 text-muted-foreground">Drag the box to move it, its corners to resize. Switch to another tool to see the result.</p>
            </>
          ) : tool === 'text' ? (
            <>
              <button type="button" onClick={addText} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Add text</button>
              {edit.texts.length ? (
                <div className="flex flex-wrap gap-1">{edit.texts.map(text => <button key={text.id} type="button" onClick={() => setSelected({ kind: 'text', id: text.id })} className={`max-w-[130px] truncate rounded-md px-2 py-1 text-[10px] ${selected?.id === text.id ? 'bg-primary/20 text-primary' : 'bg-white/[0.05]'}`}>{text.text.split('\n')[0] || 'Text'}</button>)}</div>
              ) : null}
              {selectedText ? (
                <div className="space-y-2 rounded-lg border border-white/[0.07] p-2">
                  <textarea value={selectedText.text} onChange={event => updateText({ text: event.target.value })} onFocus={snapshot} onKeyDown={event => event.stopPropagation()} rows={2} className="w-full resize-y rounded-md bg-white/[0.05] px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-primary/60" aria-label="Text" />
                  <select value={selectedText.font} onChange={event => updateText({ font: event.target.value }, true)} className="h-8 w-full rounded-md border border-white/[0.08] bg-black/40 px-2 text-[12px] outline-none" style={{ fontFamily: previewFamily(selectedText.font) }}>
                    {BUNDLED_FAMILIES.map(font => <option key={font.family} value={font.family}>{font.family}</option>)}
                  </select>
                  <div onPointerDown={snapshot}><Range label="Size" value={selectedText.size} min={0.02} max={0.4} step={0.005} reset={0.08} onChange={size => updateText({ size })} format={value => `${Math.round(value * 100)}`} /></div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <input type="color" value={selectedText.color} onChange={event => updateText({ color: event.target.value })} onFocus={snapshot} className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent" aria-label="Text colour" />
                    <button type="button" onClick={() => updateText({ weight: selectedText.weight >= 700 ? 400 : 800 }, true)} className={`h-7 rounded-md px-2 font-bold ${selectedText.weight >= 700 ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05]'}`}>B</button>
                    <button type="button" onClick={() => updateText({ shadow: !selectedText.shadow }, true)} className={`h-7 rounded-md px-2 ${selectedText.shadow ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05]'}`}>Shadow</button>
                    <button type="button" onClick={() => updateText({ background: selectedText.background ? null : 'rgba(0,0,0,0.6)' }, true)} className={`h-7 rounded-md px-2 ${selectedText.background ? 'bg-primary text-primary-foreground' : 'bg-white/[0.05]'}`}>Box</button>
                    <button type="button" onClick={() => { setEdit(current => ({ ...current, texts: current.texts.filter(item => item.id !== selectedText.id) })); setSelected(null) }} aria-label="Delete text" className="ml-auto rounded-md p-1.5 text-muted-foreground hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <p className="text-[9px] text-muted-foreground">Drag the text on the photo to place it.</p>
                </div>
              ) : null}
            </>
          ) : tool === 'elements' ? (
            <>
              <div className="grid grid-cols-3 gap-1">
                <button type="button" onClick={() => addShape('rect')} className="h-9 rounded-md bg-white/[0.05] text-[10px] font-semibold hover:bg-white/[0.1]">▭ Box</button>
                <button type="button" onClick={() => addShape('circle')} className="h-9 rounded-md bg-white/[0.05] text-[10px] font-semibold hover:bg-white/[0.1]">◯ Circle</button>
                <button type="button" onClick={() => addShape('line')} className="h-9 rounded-md bg-white/[0.05] text-[10px] font-semibold hover:bg-white/[0.1]">― Line</button>
              </div>
              <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Stickers</p>
              <div className="grid grid-cols-8 gap-1">{STICKERS.map(sticker => <button key={sticker} type="button" onClick={() => addShape('sticker', sticker)} className="h-8 rounded-md bg-white/[0.04] text-[16px] hover:bg-white/[0.1]">{sticker}</button>)}</div>
              {selectedShape ? (
                <div className="space-y-2 rounded-lg border border-white/[0.07] p-2" onPointerDown={snapshot}>
                  {selectedShape.kind !== 'sticker' ? <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><span className="w-[72px] shrink-0">Colour</span><input type="color" value={selectedShape.color} onChange={event => updateShape({ color: event.target.value })} onFocus={snapshot} className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent" /></label> : null}
                  <Range label="Opacity" value={selectedShape.opacity} min={0.05} max={1} reset={1} onChange={opacity => updateShape({ opacity })} />
                  <Range label="Width" value={selectedShape.width} min={0.02} max={1.5} reset={0.25} onChange={width => updateShape({ width })} />
                  <Range label="Height" value={selectedShape.height} min={0.01} max={1.5} reset={0.25} onChange={height => updateShape({ height })} />
                  {selectedShape.kind === 'rect' ? <Range label="Round corners" value={selectedShape.radius} min={0} max={1} reset={0.2} onChange={radius => updateShape({ radius })} /> : null}
                  <button type="button" onClick={() => { setEdit(current => ({ ...current, shapes: current.shapes.filter(item => item.id !== selectedShape.id) })); setSelected(null) }} className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-white/[0.04] text-[10px] text-muted-foreground hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                </div>
              ) : <p className="text-[9px] leading-4 text-muted-foreground">Add one, then drag it on the photo. The corner handle resizes it.</p>}
            </>
          ) : (
            <>
              {photo && cutouts.has(photo.id) ? (
                <>
                  <p className="text-[11px] font-semibold">Behind the subject</p>
                  <div className="grid grid-cols-4 gap-1">
                    {([[null, 'None'], ['#ffffff', 'White'], ['#000000', 'Black'], ['#9dfab0', 'Mint']] as const).map(([color, label]) => (
                      <button key={label} type="button" onClick={() => setEdit(current => ({ ...current, backdrop: color }))} className={`h-8 rounded-md text-[10px] font-semibold ${edit.backdrop === color ? 'ring-2 ring-primary' : ''}`} style={{ background: color ?? 'repeating-conic-gradient(#2a2b30 0% 25%, #1a1b1f 0% 50%) 50% / 10px 10px', color: color === '#ffffff' || color === '#9dfab0' ? '#000' : '#fff' }}>{label}</button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><span className="w-[72px] shrink-0">Any colour</span><input type="color" value={edit.backdrop ?? '#3355ff'} onChange={event => setEdit(current => ({ ...current, backdrop: event.target.value }), false)} onFocus={snapshot} className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent" /></label>
                  <button type="button" onClick={restoreBackground} className="h-8 w-full rounded-md bg-white/[0.04] text-[10px] text-muted-foreground hover:text-foreground">Bring the original background back</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { void removeBackground() }} disabled={Boolean(busy)} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground disabled:opacity-50"><Wand2 className="h-4 w-4" /> Remove background</button>
                  <p className="text-[10px] leading-4 text-muted-foreground">Cuts out the person or product. Then keep it see-through (great on top of a video) or put a colour behind it.</p>
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
