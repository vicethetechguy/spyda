import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Layers, Loader2, Redo2, Sparkles, Undo2, Wand2 } from 'lucide-react'
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

  if (!project) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <Layers className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="font-heading text-xl font-semibold">This project is not on this device</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Saved projects live in this browser. Open the workspace and pick a design to edit it.
        </p>
        <Link
          to="/workspace"
          className="glass inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:border-primary/40 hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to the workspace
        </Link>
      </main>
    )
  }

  const cutoutTargets = design?.objects.filter(object => CUTOUT_KINDS.includes(object.kind)) ?? []
  const extracted = design?.objects.some(object => object.content.assetRef) ?? false

  return (
    <main className="flex min-h-screen flex-col">
      <header className="glass glass-blur sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b px-3 py-2 sm:px-5">
        <Link
          to="/workspace"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Workspace
        </Link>

        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{project.name}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {design ? `${design.objects.length} layers` : 'flat picture'}
            {saved ? ' · saved' : ''}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setHistory(current => (current ? undo(current) : current))}
            disabled={!history || !canUndo(history)}
            title={(history && nextUndoLabel(history)) || 'Nothing to undo'}
            aria-label="Undo"
            className="rounded-lg p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Undo2 className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setHistory(current => (current ? redo(current) : current))}
            disabled={!history || !canRedo(history)}
            title={(history && nextRedoLabel(history)) || 'Nothing to redo'}
            aria-label="Redo"
            className="rounded-lg p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Redo2 className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleExtract}
            disabled={Boolean(extracting) || !design || !project.referencePreview}
            className="glass inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            {extracting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              : <Wand2 className="h-3.5 w-3.5" aria-hidden />}
            {extracting ? 'Cutting out…' : extracted ? 'Refresh cut-outs' : 'Make it editable'}
          </button>
        </div>
      </header>

      {notice ? (
        <div
          role="status"
          className={[
            'flex items-start gap-2 border-b px-3 py-2 text-[11px] leading-relaxed sm:px-5',
            notice.tone === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive-foreground'
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
        <p className="border-b border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200 sm:px-5">
          {[...missingFonts].join(', ')} {missingFonts.size > 1 ? 'are' : 'is'} not loaded on this device, so
          {missingFonts.size > 1 ? ' those layers render' : ' that layer renders'} in Montserrat. Fonts are matched
          by class, not by file.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:px-5 lg:flex-row">
        <section className="relative min-h-[46vh] flex-1 self-stretch overflow-hidden rounded-xl border border-white/10 bg-surface">
          {design ? (
            <LayerCanvas
              document={design}
              images={images}
              fallbackImage={flatFlyer}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onGeometryChange={(objectId, bounds, rotation) => applyStep([
                { objectId, property: 'bounds', value: bounds, explicitGeometryChange: true },
                { objectId, property: 'rotation', value: rotation, explicitGeometryChange: true },
              ], 'Move layer', `move:${objectId}`)}
              missingFonts={missingFonts}
              className="absolute inset-0 flex items-center justify-center"
            />
          ) : project.referencePreview ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <img
                src={project.referencePreview}
                alt="Reference flyer"
                className="max-h-[52vh] w-auto rounded-lg border border-white/10"
              />
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                This flyer is still a flat picture. Analyse it in the workspace so its parts become
                layers, then they turn up here.
              </p>
            </div>
          ) : null}
        </section>

        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[300px]">
          <div className="glass rounded-xl border p-2">
            <div className="flex items-center justify-between px-1.5 pb-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Layers</h2>
              {missingAssets.length
                ? <span className="text-[10px] text-amber-300">{missingAssets.length} loading</span>
                : <Check className="h-3 w-3 text-primary/70" aria-hidden />}
            </div>
            <div className="max-h-[38vh] overflow-y-auto lg:max-h-[42vh]">
              <LayerList
                objects={design?.objects ?? []}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onReorder={handleReorder}
                onToggleVisibility={handleToggleVisibility}
                onDuplicate={handleDuplicate}
                onRemove={objectId => applyIntent({ objectId, property: 'removed', value: true })}
              />
            </div>
          </div>

          <div className="glass min-h-0 flex-1 overflow-y-auto rounded-xl border p-2">
            <h2 className="px-1.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Content
            </h2>
            <ContentPanel
              object={selectedObject}
              onIntent={applyIntent}
              onReplaceImage={handleReplaceImage}
              busy={Boolean(extracting)}
            />
          </div>
        </aside>
      </div>

      {extracting ? (
        <p className="border-t border-white/10 px-3 py-2 text-[11px] text-muted-foreground sm:px-5" role="status">
          {extracting.total
            ? `Cutting out layer ${extracting.done} of ${extracting.total}…`
            : 'Reading the flyer once to build its mask…'}
        </p>
      ) : design && !cutoutTargets.length ? (
        <p className="border-t border-white/10 px-3 py-2 text-[11px] text-muted-foreground sm:px-5">
          No pictures were detected on this flyer, so there is nothing to cut out.
        </p>
      ) : null}
    </main>
  )
}
