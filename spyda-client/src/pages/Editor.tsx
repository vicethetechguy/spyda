import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Check, Clock, Copy, Eye, Image as ImageIcon, Layers, Loader2, Move, Palette, Redo2, Sparkles,
  Trash2, Type, Undo2, Wand2, X, type LucideIcon,
} from '../components/ui/icons'
import {
  adaptBreakdownToDesignDocument,
  designDocumentToLegacyBreakdown,
  type DesignDocument,
  type DesignObject,
} from '../core/design-document'
import { CUTOUT_KINDS, extractLayers } from '../core/layer-extraction'
import type { DesignEditIntent } from '../core/constraint-engine'
import { putAsset } from '../lib/asset-store'
import { createMatteCutoutProducer, loadSourceImage, produceFullFrameBackground } from '../lib/cutout'
import { prepareForEditing } from '../lib/editor-document'
import { collectFontRequests, preloadFonts, type FontReport } from '../lib/fonts'
import {
  adoptDocument,
  canRedo,
  canUndo,
  commitIntent,
  commitStep,
  createHistory,
  currentDocument,
  nextRedoLabel,
  nextUndoLabel,
  redo,
  undo,
  type IntentHistory,
} from '../lib/intent-history'
import { patchProject, readProject, type StoredProject } from '../lib/project-store'
import { segmentFlyer } from '../lib/segmentation'
import LayerCanvas from '../components/editor/LayerCanvas'
import ContentPanel from '../components/editor/ContentPanel'
import LayerList from '../components/editor/LayerList'
import { useAssetImages } from '../components/editor/useAssetImages'

/**
 * The layer editor.
 *
 * Lazy-loaded from `App.tsx` so nothing here reaches the landing bundle. It is a
 * separate route rather than a rewrite of `Workspace.tsx`: the design document
 * below is canonical, and it is bridged back to the legacy breakdown shape on save
 * so existing projects keep opening in the workspace.
 *
 * The document is held inside `IntentHistory`, never beside it - one source of
 * truth, so a replay and the live view cannot disagree.
 */

type Notice = { tone: 'info' | 'warn' | 'error'; text: string }

/**
 * Edits that arrive as a stream while the pointer or the caret is down.
 * Folding them means one undo per burst of typing or one drag, instead of one
 * undo per keystroke. Structural intents stay out: two duplicates are two
 * layers, however fast they arrive.
 */
const CONTINUOUS_PROPERTIES: ReadonlySet<DesignEditIntent['property']> = new Set([
  'text', 'fill', 'stroke', 'opacity', 'fontFamily', 'fontSize', 'fontWeight', 'textAlign', 'bounds', 'rotation',
])

function streamKey(intent: DesignEditIntent) {
  return CONTINUOUS_PROPERTIES.has(intent.property) ? `${intent.objectId}:${intent.property}` : undefined
}

type BootState = { project: StoredProject | null; history: IntentHistory | null }

type PanelTab = 'layers' | 'content' | 'history'
type LayerFilter = 'all' | 'text' | 'pictures' | 'logos' | 'shapes'

const FILTERS: { id: LayerFilter; label: string }[] = [
  { id: 'all', label: 'All layers' },
  { id: 'text', label: 'Text' },
  { id: 'pictures', label: 'Pictures' },
  { id: 'logos', label: 'Logos' },
  { id: 'shapes', label: 'Shapes' },
]

function matchesFilter(object: DesignObject, filter: LayerFilter) {
  if (filter === 'all') return true
  if (filter === 'text') return object.kind === 'text' || object.kind === 'action'
  if (filter === 'pictures') return object.kind === 'image' || object.kind === 'background'
  if (filter === 'logos') return object.kind === 'logo' || object.kind === 'icon' || object.kind === 'qr-code'
  return object.kind === 'shape' || object.kind === 'decor' || object.kind === 'group'
}

/** The icon a history step shows on the timeline, from what it changed. */
function stepIcon(intents: DesignEditIntent[]): LucideIcon {
  const property = intents[0]?.property
  if (property === 'text' || property === 'fontFamily' || property === 'fontSize' || property === 'fontWeight' || property === 'textAlign') return Type
  if (property === 'fill' || property === 'stroke' || property === 'opacity') return Palette
  if (property === 'bounds' || property === 'rotation' || property === 'zIndex') return Move
  if (property === 'assetRef') return ImageIcon
  if (property === 'duplicate') return Copy
  if (property === 'removed') return Trash2
  if (property === 'visible') return Eye
  return Sparkles
}

/** Undo or redo until `target` steps are applied: one click on the timeline. */
function jumpTo(history: IntentHistory, target: number) {
  let next = history
  while (next.cursor > target && canUndo(next)) next = undo(next)
  while (next.cursor < target && canRedo(next)) next = redo(next)
  return next
}

function newObjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `layer-${crypto.randomUUID().slice(0, 8)}`
    : `layer-${Date.now().toString(36)}`
}

function documentFromProject(project: StoredProject): DesignDocument | null {
  if (!project.breakdown) return null
  try {
    const adapted = adaptBreakdownToDesignDocument(project.breakdown, {
      id: project.id,
      provider: 'spyda-editor',
      sourceAsset: { fileName: project.name, mimeType: null },
    })
    // The analyser's locks protect geometry from a rewrite; here the person is
    // the edit, so measured placement has to be movable.
    return prepareForEditing(adapted)
  } catch {
    return null
  }
}

function readEditorState(projectId: string | undefined): BootState {
  const project = projectId ? readProject(projectId) : null
  if (!project) return { project: null, history: null }
  const design = documentFromProject(project)
  return { project, history: design ? createHistory(design) : null }
}

export default function Editor() {
  const { projectId } = useParams<{ projectId: string }>()
  const [{ project }] = useState<BootState>(() => readEditorState(projectId))
  const [history, setHistory] = useState<IntentHistory | null>(() => readEditorState(projectId).history)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [extracting, setExtracting] = useState<{ done: number; total: number } | null>(null)
  const [fontReport, setFontReport] = useState<FontReport | null>(null)
  const [saved, setSaved] = useState(false)
  const [flatFlyer, setFlatFlyer] = useState<HTMLImageElement | null>(null)
  const [tab, setTab] = useState<PanelTab>('layers')
  const [filter, setFilter] = useState<LayerFilter>('all')
  const navigate = useNavigate()
  const edited = useRef(false)

  // The analysed flat picture, drawn under the layers until they have pixels.
  useEffect(() => {
    const source = project?.referencePreview
    if (!source) return
    let active = true
    loadSourceImage(source)
      .then(image => { if (active) setFlatFlyer(image) })
      .catch(() => undefined)
    return () => { active = false }
  }, [project?.referencePreview])

  // `design`, not `document`: shadowing the canvas global here is a trap.
  const design = history ? currentDocument(history) : null
  const { images, missing: missingAssets } = useAssetImages(design)

  const selectedObject = useMemo(
    () => design?.objects.find(object => object.id === selectedId) ?? null,
    [design, selectedId],
  )

  // The key is the whole dependency: re-asking the browser for faces that did not
  // change would run on every keystroke, and re-running on the document would
  // never settle.
  const fontRequestKey = design
    ? collectFontRequests(design.objects)
      .map(request => `${request.family}\u0000${request.weight ?? ''}`)
      .sort()
      .join('|')
    : ''

  useEffect(() => {
    let active = true
    const requests = fontRequestKey
      ? fontRequestKey.split('|').map(entry => {
        const [family, weight] = entry.split('\u0000')
        return { family, weight: weight || null }
      })
      : []

    if (!requests.length) {
      setFontReport(null)
      return () => { active = false }
    }

    preloadFonts(requests).then(report => {
      if (active) setFontReport(report)
    })
    return () => { active = false }
  }, [fontRequestKey])

  const missingFonts = useMemo(() => new Set(fontReport?.missing ?? []), [fontReport])

  const persist = useCallback((next: DesignDocument) => {
    if (!projectId) return
    patchProject(projectId, {
      breakdown: designDocumentToLegacyBreakdown(next, project?.breakdown),
    })
    setSaved(true)
  }, [project?.breakdown, projectId])

  // Debounced autosave, but only once the user has actually changed something.
  useEffect(() => {
    if (!design || !edited.current || !projectId) return
    const timer = window.setTimeout(() => persist(design), 800)
    return () => window.clearTimeout(timer)
  }, [design, persist, projectId])

  const reportRejection = useCallback((message?: string) => {
    setNotice({ tone: 'error', text: message ?? 'That change is not allowed on this layer.' })
  }, [])

  const applyIntent = useCallback((intent: DesignEditIntent) => {
    setHistory(current => {
      if (!current) return current
      const key = streamKey(intent)
      const result = commitIntent(current, intent, key ? { coalesceKey: key } : {})
      if (!result.recorded) {
        reportRejection(result.violations[0]?.message)
        return current
      }
      edited.current = true
      setNotice(null)
      return result.history
    })
  }, [reportRejection])

  const applyStep = useCallback((intents: DesignEditIntent[], label: string, coalesceKey?: string) => {
    setHistory(current => {
      if (!current) return current
      const result = commitStep(current, intents, { label, coalesceKey })
      if (!result.recorded) {
        reportRejection(result.violations[0]?.message)
        return current
      }
      edited.current = true
      setNotice(null)
      return result.history
    })
  }, [reportRejection])

  const handleExtract = useCallback(async () => {
    const source = project?.referencePreview
    if (!design || !source) return

    setExtracting({ done: 0, total: 0 })
    setNotice({ tone: 'info', text: 'Loading the cut-out model. The first run downloads it once.' })
    try {
      const matte = await segmentFlyer(source)
      const image = await loadSourceImage(source)
      const result = await extractLayers({
        document: design,
        produceCutout: createMatteCutoutProducer(image, matte),
        produceBackground: () => produceFullFrameBackground(image),
        saveAsset: blob => putAsset(blob),
        onProgress: (done, total) => setExtracting({ done, total }),
      })

      setHistory(current => (current ? adoptDocument(current, result.document) : createHistory(result.document)))
      setSelectedId(null)
      edited.current = false
      persist(result.document)
      setNotice(result.warnings.length
        ? { tone: 'warn', text: result.warnings.join(' ') }
        : { tone: 'info', text: 'Every layer now has its own pixels.' })
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Layer extraction failed.',
      })
    } finally {
      setExtracting(null)
    }
  }, [design, persist, project?.referencePreview])

  const handleReplaceImage = useCallback(async (objectId: string, file: File) => {
    try {
      const id = await putAsset(file)
      applyIntent({ objectId, property: 'assetRef', value: `asset:${id}` })
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'That picture could not be stored.',
      })
    }
  }, [applyIntent])

  const handleReorder = useCallback((objectId: string, direction: 'up' | 'down') => {
    if (!design) return
    const ordered = [...design.objects].sort((left, right) => left.zIndex - right.zIndex)
    const index = ordered.findIndex(object => object.id === objectId)
    const neighbour = ordered[direction === 'up' ? index + 1 : index - 1]
    if (index === -1 || !neighbour) return

    // A swap is two intents recorded as one step, so one undo reverses both.
    applyStep([
      { objectId, property: 'zIndex', value: neighbour.zIndex },
      { objectId: neighbour.id, property: 'zIndex', value: ordered[index].zIndex },
    ], 'Reorder layers')
  }, [applyStep, design])

  const handleDuplicate = useCallback((objectId: string) => {
    applyIntent({ objectId, property: 'duplicate', value: { id: newObjectId(), name: 'Copy' } })
  }, [applyIntent])

  const handleToggleVisibility = useCallback((object: DesignObject) => {
    applyIntent({ objectId: object.id, property: 'visible', value: !object.status.visible })
  }, [applyIntent])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = Boolean(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        setHistory(current => {
          if (!current) return current
          return event.shiftKey ? redo(current) : undo(current)
        })
        return
      }
      if (typing) return
      if (event.key === 'Escape') setSelectedId(null)
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        applyIntent({ objectId: selectedId, property: 'removed', value: true })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [applyIntent, selectedId])

  const selectLayer = (objectId: string | null) => {
    setSelectedId(objectId)
    if (objectId) setTab('content')
  }

  if (!project) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <Layers className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="font-heading text-xl font-semibold">This project is not on this device</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Saved projects live in this browser. Open Spyda AI and import the flyer to edit it here.
        </p>
        <Link
          to="/workspace"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Spyda AI
        </Link>
      </main>
    )
  }

  const objects = design?.objects ?? []
  const live = objects.filter(object => !object.status.removed)
  const cutoutTargets = objects.filter(object => CUTOUT_KINDS.includes(object.kind))
  const extracted = objects.some(object => object.content.assetRef)
  const stats = [
    { label: 'Layers', value: live.length },
    { label: 'Text', value: live.filter(object => matchesFilter(object, 'text')).length },
    { label: 'Pictures', value: live.filter(object => matchesFilter(object, 'pictures') || matchesFilter(object, 'logos')).length },
    { label: 'Hidden', value: live.filter(object => !object.status.visible).length },
  ]
  const size = design?.canvas.width && design.canvas.height
    ? `${design.canvas.width} × ${design.canvas.height}`
    : design?.canvas.aspectRatio || ''
  const steps = history?.steps ?? []
  const cursor = history?.cursor ?? 0
  const filtered = objects.filter(object => matchesFilter(object, filter))

  const tabs: { id: PanelTab; label: string; icon: LucideIcon }[] = [
    { id: 'layers', label: 'Layers', icon: Layers },
    { id: 'content', label: 'Content', icon: Type },
    { id: 'history', label: 'History', icon: Clock },
  ]

  return (
    <main className="min-h-screen bg-background p-2 sm:p-4 lg:h-[100dvh] lg:overflow-hidden">
      {/* On desktop the frame is exactly one screen, so the layer list scrolls inside its card and the canvas keeps its size. */}
      <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-[1500px] flex-col rounded-[30px] border border-white/[0.08] bg-[#15161a] p-1.5 sm:min-h-[calc(100dvh-2rem)] sm:rounded-[38px] sm:p-2 lg:h-full lg:min-h-0">
        {/* Header: close, the title tab that runs into the panel, panel pills */}
        <header className="flex flex-wrap items-end gap-2 px-1 pt-1 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate('/workspace')}
            aria-label="Close canvas mode and go back to Spyda AI"
            title="Back to Spyda AI"
            className="mb-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#0b1210] transition-transform hover:-translate-y-0.5 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 rounded-t-[24px] bg-[#0c0d0f] px-5 pb-3 pt-3 sm:px-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Canvas mode</p>
            <h1 className="max-w-[46vw] truncate font-heading text-xl font-semibold sm:text-[1.7rem]">{project.name}</h1>
          </div>

          <div className="mb-2 ml-auto flex flex-wrap items-center gap-1.5">
            {tabs.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-pressed={tab === item.id}
                aria-label={item.label}
                className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-xs font-semibold transition-all ${
                  tab === item.id
                    ? 'bg-primary text-primary-foreground shadow-[0_8px_22px_rgba(157,250,176,0.2)]'
                    : 'border border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
            <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
            <button
              type="button"
              onClick={() => setHistory(current => (current ? undo(current) : current))}
              disabled={!history || !canUndo(history)}
              title={(history && nextUndoLabel(history)) || 'Nothing to undo'}
              aria-label="Undo"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              <Undo2 className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setHistory(current => (current ? redo(current) : current))}
              disabled={!history || !canRedo(history)}
              title={(history && nextRedoLabel(history)) || 'Nothing to redo'}
              aria-label="Redo"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              <Redo2 className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleExtract}
              disabled={Boolean(extracting) || !design || !project.referencePreview}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-[#0b1210] transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-50"
            >
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" aria-hidden />}
              {extracting ? 'Cutting out…' : extracted ? 'Refresh cut-outs' : 'Make it editable'}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-[24px] bg-[#0c0d0f] p-3 sm:rounded-[30px] sm:p-4">
          {/* Summary: the flyer card, its numbers, the layer filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="flex items-center gap-3 rounded-[22px] bg-surface-raised p-2.5 pr-5 lg:w-[300px]">
              {project.referencePreview ? (
                <img src={project.referencePreview} alt="" className="h-16 w-14 shrink-0 rounded-[14px] border border-white/10 object-cover" />
              ) : null}
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">{size}</p>
                <p className="truncate text-sm font-semibold">{project.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{saved ? 'Saved on this device' : 'No changes yet'}</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2 px-1">
                {stats.map(stat => (
                  <div key={stat.label}>
                    <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                    <p className="font-heading text-2xl font-semibold leading-tight">{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setFilter(item.id); setTab('layers') }}
                    aria-pressed={filter === item.id}
                    className={`h-8 rounded-full px-3.5 text-[11px] font-medium transition-colors ${
                      filter === item.id ? 'bg-white text-[#0b1210]' : 'bg-white/[0.05] text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {notice ? (
            <div
              role="status"
              className={[
                'flex items-start gap-2 rounded-2xl border px-3 py-2 text-[11px] leading-relaxed',
                notice.tone === 'error'
                  ? 'border-destructive/30 bg-destructive/10 text-red-200'
                  : notice.tone === 'warn'
                    ? 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200'
                    : 'border-white/10 bg-white/[0.03] text-muted-foreground',
              ].join(' ')}
            >
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span className="flex-1">{notice.text}</span>
              <button type="button" onClick={() => setNotice(null)} className="shrink-0 underline">Dismiss</button>
            </div>
          ) : null}

          {missingFonts.size ? (
            <p className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200">
              {[...missingFonts].join(', ')} {missingFonts.size > 1 ? 'are' : 'is'} not loaded on this device, so
              {missingFonts.size > 1 ? ' those layers render' : ' that layer renders'} in Montserrat.
            </p>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
            <section className="relative min-h-[56vh] flex-1 overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#08090a] lg:min-h-0">
              <div aria-hidden="true" className="absolute inset-x-6 top-5 h-px bg-[linear-gradient(90deg,transparent,rgba(157,250,176,0.5),rgba(139,211,255,0.4),transparent)]" />
              {design ? (
                <LayerCanvas
                  document={design}
                  images={images}
                  fallbackImage={flatFlyer}
                  selectedId={selectedId}
                  onSelect={selectLayer}
                  onGeometryChange={(objectId, bounds, rotation) => applyStep([
                    { objectId, property: 'bounds', value: bounds, explicitGeometryChange: true },
                    { objectId, property: 'rotation', value: rotation, explicitGeometryChange: true },
                  ], 'Move layer', `move:${objectId}`)}
                  missingFonts={missingFonts}
                  className="absolute inset-6 flex items-center justify-center sm:inset-10"
                />
              ) : project.referencePreview ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <img src={project.referencePreview} alt="Reference flyer" className="max-h-[52vh] w-auto rounded-2xl border border-white/10" />
                  <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                    This flyer is still a flat picture. Open it from Spyda AI again so its parts become layers.
                  </p>
                </div>
              ) : null}
              {extracting ? (
                <p className="absolute bottom-4 left-4 rounded-full bg-black/75 px-3 py-1.5 text-[11px] text-white backdrop-blur" role="status">
                  {extracting.total ? `Cutting out layer ${extracting.done} of ${extracting.total}…` : 'Reading the flyer once to build its mask…'}
                </p>
              ) : design && !cutoutTargets.length ? (
                <p className="absolute bottom-4 left-4 rounded-full bg-black/60 px-3 py-1.5 text-[11px] text-muted-foreground">No pictures to cut out on this flyer.</p>
              ) : null}
            </section>

            <aside className="flex min-h-[320px] w-full shrink-0 flex-col rounded-[24px] bg-surface-raised p-3 lg:w-[340px]">
              <div className="flex items-center justify-between px-1.5 pb-3 pt-1">
                <h2 className="font-heading text-lg font-semibold">{tabs.find(item => item.id === tab)?.label}</h2>
                {tab === 'layers' ? (
                  missingAssets.length
                    ? <span className="text-[10px] text-amber-300">{missingAssets.length} loading</span>
                    : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]"><Check className="h-3.5 w-3.5 text-primary" aria-hidden /></span>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {tab === 'layers' ? (
                  <LayerList
                    objects={filtered}
                    selectedId={selectedId}
                    onSelect={selectLayer}
                    onReorder={handleReorder}
                    onToggleVisibility={handleToggleVisibility}
                    onDuplicate={handleDuplicate}
                    onRemove={objectId => applyIntent({ objectId, property: 'removed', value: true })}
                  />
                ) : tab === 'content' ? (
                  <ContentPanel
                    object={selectedObject}
                    onIntent={applyIntent}
                    onReplaceImage={handleReplaceImage}
                    busy={Boolean(extracting)}
                  />
                ) : steps.length ? (
                  <ol className="space-y-1.5">
                    {steps.map((step, index) => {
                      const Icon = stepIcon(step.intents)
                      const applied = index < cursor
                      return (
                        <li key={index}>
                          <button
                            type="button"
                            onClick={() => setHistory(current => (current ? jumpTo(current, index + 1) : current))}
                            className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.05] ${applied ? 'text-foreground' : 'text-muted-foreground/60 line-through'}`}
                          >
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${index === cursor - 1 ? 'bg-primary text-primary-foreground' : 'bg-white/[0.06]'}`}><Icon className="h-3.5 w-3.5" /></span>
                            {step.label}
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <p className="px-2 py-6 text-xs leading-relaxed text-muted-foreground">Every change you make shows up here and on the timeline below. Click one to go back to it.</p>
                )}
              </div>
            </aside>
          </div>

          {/* Timeline: every edit is a stop, the current one is lit */}
          <nav aria-label="Edit timeline" className="flex items-center gap-2 overflow-x-auto rounded-full bg-white p-1.5 text-[#0b1210] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setHistory(current => (current ? jumpTo(current, 0) : current))}
              title="Back to the original"
              aria-label="Back to the original"
              className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#0b1210] px-3.5 text-[11px] font-semibold text-white"
            >
              <Clock className="h-3.5 w-3.5" /> Original
            </button>
            {steps.length ? steps.map((step, index) => {
              const Icon = stepIcon(step.intents)
              const current = index === cursor - 1
              const applied = index < cursor
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setHistory(value => (value ? jumpTo(value, index + 1) : value))}
                  title={step.label}
                  aria-label={`Go to: ${step.label}`}
                  aria-current={current ? 'step' : undefined}
                  className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all ${
                    current ? 'bg-primary text-primary-foreground ring-4 ring-primary/30' : applied ? 'bg-[#0b1210]/[0.08]' : 'bg-transparent text-[#0b1210]/35'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {step.intents.length > 1 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{step.intents.length}</span>
                  ) : null}
                </button>
              )
            }) : <span className="px-2 text-[11px] text-[#0b1210]/55">Your edits line up here as you work.</span>}
          </nav>
        </div>
      </div>
    </main>
  )
}
