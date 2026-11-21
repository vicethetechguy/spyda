import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Clock, Copy, Download, Eye, Image as ImageIcon, Layers, Loader2, Move, Palette, Plus, Redo2, Sparkles,
  Trash2, Type, Undo2, Wand2, type LucideIcon,
} from '../components/ui/icons'
import type Konva from 'konva'
import {
  adaptBreakdownToDesignDocument,
  designDocumentToLegacyBreakdown,
  type DesignDocument,
  type DesignObject,
} from '../core/design-document'
import { CUTOUT_KINDS, extractLayers } from '../core/layer-extraction'
import type { DesignEditIntent } from '../core/constraint-engine'
import { putAsset } from '../lib/asset-store'
import { makeLayer, type NewLayerKind } from '../lib/editor-objects'
import { describeCanvas, translateOperations } from '../lib/canvas-assist'
import { requestCanvasAssist } from '../lib/chat'
import { spydaRequestHeaders } from '../lib/spyda-api'
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
import AssistPanel, { type AssistEntry } from '../components/editor/AssistPanel'
import CanvasToolbar from '../components/editor/CanvasToolbar'

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

/** The editor's pages, like a video editor's: one job each, the canvas always in the middle. */
type EditorPage = 'design' | 'text' | 'colour' | 'media' | 'ai' | 'deliver' | 'history'
const PAGE_ORDER: EditorPage[] = ['design', 'text', 'colour', 'media', 'ai', 'deliver', 'history']
type Delivery = { format: 'png' | 'jpeg'; scale: number; name: string }
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
  if (property === 'create') return Plus
  return Sparkles
}

/** True for light colours, so text drawn on them should be dark. */
function isLight(colour: string | null | undefined) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour?.trim() || '')?.[1]
  if (!hex) return true
  const full = hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex
  const [r, g, b] = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6
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
  const [page, setPage] = useState<EditorPage>('design')
  const [delivery, setDelivery] = useState<Delivery>({ format: 'png', scale: 1, name: '' })
  // Deliver shows the design as it will export: no selection handles.
  useEffect(() => {
    if (page === 'deliver') setSelectedId(null)
  }, [page])
  const [filter, setFilter] = useState<LayerFilter>('all')
  const [assistEntries, setAssistEntries] = useState<AssistEntry[]>([])
  const [assistDraft, setAssistDraft] = useState('')
  const [assistBusy, setAssistBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const stageRef = useRef<Konva.Stage | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
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

  /** A new layer from the toolbar or a shortcut, selected and ready to edit. */
  const addLayer = useCallback((kind: NewLayerKind, options: Parameters<typeof makeLayer>[2] = {}) => {
    if (!design) return
    if (kind === 'image' && !options.assetRef) {
      imageInputRef.current?.click()
      return
    }
    // New text contrasts with the background it lands on.
    const backdrop = design.objects.find(object => object.kind === 'background' && !object.status.removed)?.style.fill
    const textFill = kind === 'text' && options.fill === undefined ? (isLight(backdrop) ? '#0b1210' : '#ffffff') : options.fill
    const layer = makeLayer(design, kind, { ...options, fill: textFill })
    applyStep([{ objectId: layer.id, property: 'create', value: layer }], `Add ${layer.name.toLowerCase()}`)
    setSelectedId(layer.id)
  }, [applyStep, design])

  const handleImageFile = useCallback(async (file: File) => {
    if (!design) return
    try {
      const id = await putAsset(file)
      const url = URL.createObjectURL(file)
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
        image.onerror = () => reject(new Error('That picture could not be opened.'))
        image.src = url
      }).finally(() => URL.revokeObjectURL(url))
      // Half the canvas width, at the picture's own proportions, centred.
      const canvasRatio = (design.canvas.width || 1) / (design.canvas.height || 1)
      const width = 50
      const height = Math.min(90, width * (size.height / size.width) * canvasRatio)
      addLayer('image', {
        assetRef: `asset:${id}`,
        name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Image',
        bounds: { x: (100 - width) / 2, y: (100 - height) / 2, width, height },
      })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'That picture could not be added.' })
    }
  }, [addLayer, design])

  const handleExport = useCallback(async (options: Delivery = { format: 'png', scale: 1, name: '' }) => {
    const stage = stageRef.current
    if (!stage || !design) return
    setExporting(true)
    setSelectedId(null)
    // Let the selection handles disappear before the frame is captured.
    await new Promise(resolve => window.setTimeout(resolve, 80))
    try {
      // Render a little over size, then draw into a canvas of exactly the
      // design's pixels: the on-screen stage is rounded, so its ratio is not.
      const width = Math.round((design.canvas.width || stage.width()) * options.scale)
      const height = Math.round((design.canvas.height || stage.height()) * options.scale)
      const rendered = stage.toCanvas({ pixelRatio: Math.max(1, width / stage.width()) })
      const output = document.createElement('canvas')
      output.width = width
      output.height = height
      const context = output.getContext('2d')
      if (!context) throw new Error('No canvas context')
      context.imageSmoothingQuality = 'high'
      context.drawImage(rendered, 0, 0, width, height)
      const mimeType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png'
      const url = output.toDataURL(mimeType, 0.92)
      const link = document.createElement('a')
      link.href = url
      const base = (options.name.trim() || project?.name || 'spyda-design').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'spyda-design'
      link.download = `${base}.${options.format === 'jpeg' ? 'jpg' : 'png'}`
      link.click()
    } catch {
      setNotice({ tone: 'error', text: 'This design could not be exported. Remove any picture that failed to load and try again.' })
    } finally {
      setExporting(false)
    }
  }, [design, project?.name])

  /** Spyda AI: the canvas as layers out, validated operations back in, one undo step. */
  const runAssist = useCallback(async (instruction: string) => {
    if (!design || assistBusy) return
    const entry = (role: AssistEntry['role'], text: string, error = false): AssistEntry => ({ id: `${Date.now()}-${Math.random()}`, role, text, error })
    setAssistEntries(current => [...current, entry('user', instruction)])
    setAssistDraft('')
    setAssistBusy(true)
    try {
      const result = await requestCanvasAssist(
        { instruction, ...describeCanvas(design) },
        await spydaRequestHeaders({ openai: '', groq: '' }, 'groq'),
      )
      const { intents, skipped } = translateOperations(design, result.operations)
      if (intents.length) applyStep(intents, `Spyda AI: ${instruction.slice(0, 40)}`)
      const note = !intents.length
        ? ' No changes could be applied.'
        : skipped ? ` (${skipped} change${skipped > 1 ? 's' : ''} skipped.)` : ''
      setAssistEntries(current => [...current, entry('assistant', `${result.reply}${note}`)])
    } catch (error) {
      setAssistEntries(current => [...current, entry('assistant', error instanceof Error ? error.message : 'Spyda AI could not change the design.', true)])
    } finally {
      setAssistBusy(false)
    }
  }, [applyStep, assistBusy, design])

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
      const selected = selectedId ? design?.objects.find(object => object.id === selectedId) : null
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedId) {
        event.preventDefault()
        handleDuplicate(selectedId)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const pageIndex = event.shiftKey ? Number(event.code.replace('Digit', '')) - 1 : -1
      if (pageIndex >= 0 && pageIndex < PAGE_ORDER.length) {
        event.preventDefault()
        setPage(PAGE_ORDER[pageIndex])
        return
      }
      if (event.key === 'Escape') setSelectedId(null)
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        applyIntent({ objectId: selectedId, property: 'removed', value: true })
        return
      }
      const tool = ({ v: 'select', t: 'text', r: 'rect', o: 'circle', i: 'image' } as const)[event.key.toLowerCase() as 'v' | 't' | 'r' | 'o' | 'i']
      if (tool) {
        event.preventDefault()
        if (tool === 'select') setSelectedId(null)
        else addLayer(tool)
        return
      }
      // Arrow keys nudge the selection; shift moves further. One undo per burst.
      const step = event.shiftKey ? 2 : 0.5
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key as 'ArrowLeft']
      if (delta && selected?.transform.bounds && !selected.protection.locked && !selected.constraints.lockPosition) {
        event.preventDefault()
        const bounds = selected.transform.bounds
        applyStep([{
          objectId: selected.id,
          property: 'bounds',
          value: { ...bounds, x: Math.round((bounds.x + delta[0]) * 10) / 10, y: Math.round((bounds.y + delta[1]) * 10) / 10 },
          explicitGeometryChange: true,
        }], 'Nudge layer', `move:${selected.id}`)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addLayer, applyIntent, applyStep, design?.objects, handleDuplicate, selectedId])

  const selectLayer = (objectId: string | null) => {
    setSelectedId(objectId)
  }

  const editText = (objectId: string) => {
    const object = design?.objects.find(item => item.id === objectId)
    if (!object || !matchesFilter(object, 'text')) return
    setSelectedId(objectId)
    setPage('design')
    window.setTimeout(() => {
      const field = document.getElementById('spyda-layer-text') as HTMLTextAreaElement | null
      field?.focus()
      field?.select()
    }, 60)
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
  const size = design?.canvas.width && design.canvas.height
    ? `${design.canvas.width} × ${design.canvas.height}`
    : design?.canvas.aspectRatio || ''
  const steps = history?.steps ?? []
  const cursor = history?.cursor ?? 0
  const filtered = objects.filter(object => matchesFilter(object, filter))
  const background = live.find(object => object.kind === 'background')
  const textLayers = live.filter(object => matchesFilter(object, 'text')).sort((left, right) => right.zIndex - left.zIndex)
  const imageLayers = live.filter(object => object.kind !== 'background' && (matchesFilter(object, 'pictures') || matchesFilter(object, 'logos')))
  const designColours = [...new Set(live.flatMap(object => [object.style.fill, object.style.stroke])
    .filter((value): value is string => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value))
    .map(value => value.toUpperCase()))].slice(0, 18)
  const selectedFillable = selectedObject && !selectedObject.protection.locked && selectedObject.protection.editableProperties.includes('fill')
  const blankCanvas = live.every(object => object.kind === 'background')

  const pages: { id: EditorPage; label: string; icon: LucideIcon }[] = [
    { id: 'design', label: 'Design', icon: Layers },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'colour', label: 'Colour', icon: Palette },
    { id: 'media', label: 'Media', icon: ImageIcon },
    { id: 'ai', label: 'Spyda AI', icon: Sparkles },
    { id: 'deliver', label: 'Deliver', icon: Download },
    { id: 'history', label: 'History', icon: Clock },
  ]

  const inspector = selectedObject ? (
    <div className="editor-dense">
      <ContentPanel object={selectedObject} onIntent={applyIntent} onReplaceImage={handleReplaceImage} busy={Boolean(extracting)} />
    </div>
  ) : null

  const sectionLabel = (text: string) => (
    <p className="mb-1.5 px-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">{text}</p>
  )

  const quickAdd = (kinds: ReadonlyArray<readonly [NewLayerKind, string]>) => (
    <div className="grid grid-cols-2 gap-1.5">
      {kinds.map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          onClick={() => addLayer(kind)}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-md bg-white/[0.05] text-[11px] font-medium transition-colors hover:bg-white/[0.09]"
        >
          <Plus className="h-3 w-3" /> {label}
        </button>
      ))}
    </div>
  )

  const backgroundControl = background && !background.protection.locked && background.protection.editableProperties.includes('fill') ? (
    <label className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-2 py-1.5">
      <span className="text-[11px] text-muted-foreground">Background</span>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">{background.style.fill || '#FFFFFF'}</span>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(background.style.fill || '') ? background.style.fill! : '#ffffff'}
          onChange={event => applyIntent({ objectId: background.id, property: 'fill', value: event.target.value })}
          className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
        />
      </span>
    </label>
  ) : null

  const panels: Record<EditorPage, React.ReactNode> = {
    design: selectedObject ? (
      <div>
        {sectionLabel('Properties')}
        {inspector}
      </div>
    ) : (
      <div className="space-y-3">
        <div>
          {sectionLabel('Frame')}
          <div className="grid grid-cols-2 gap-1.5">
            <span className="flex h-7 items-center justify-between rounded-md bg-white/[0.04] px-2 text-[11px]"><span className="text-muted-foreground">W</span>{design?.canvas.width ?? '—'}</span>
            <span className="flex h-7 items-center justify-between rounded-md bg-white/[0.04] px-2 text-[11px]"><span className="text-muted-foreground">H</span>{design?.canvas.height ?? '—'}</span>
          </div>
        </div>
        <div>
          {sectionLabel('Fill')}
          {backgroundControl ?? <p className="text-[11px] text-muted-foreground">This flyer's background is part of the picture.</p>}
        </div>
        <div>
          {sectionLabel('Insert')}
          {quickAdd([['text', 'Text'], ['rect', 'Rectangle'], ['circle', 'Circle'], ['image', 'Image']])}
        </div>
        <div className="border-t border-white/[0.06] pt-3">
          <div className="flex items-center justify-between">
            {sectionLabel('Export')}
            <button type="button" onClick={() => setPage('deliver')} aria-label="Export settings" className="-mt-1.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"><Plus className="h-3 w-3" /></button>
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">Select a layer to edit it. Double-click text to change its words.</p>
        </div>
      </div>
    ),
    text: (
      <div className="space-y-3">
        <div>
          {sectionLabel(`Text layers · ${textLayers.length}`)}
          <div className="space-y-1">
            {textLayers.map(object => (
              <button
                key={object.id}
                type="button"
                onClick={() => selectLayer(object.id)}
                className={`block w-full rounded-md px-2 py-1.5 text-left transition-colors ${object.id === selectedId ? 'bg-primary/15' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}
              >
                <span className="block truncate text-[12px] font-medium">{object.content.text || object.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{object.style.fontFamily || 'Default'} · {object.style.fontSize ? `${object.style.fontSize}px` : 'auto'}</span>
              </button>
            ))}
            {!textLayers.length ? <p className="px-0.5 text-[11px] text-muted-foreground">No text yet.</p> : null}
          </div>
          <div className="mt-2">{quickAdd([['text', 'Add text']])}</div>
        </div>
        <div className="border-t border-white/[0.06] pt-3">
          {sectionLabel('Typography')}
          {selectedObject && matchesFilter(selectedObject, 'text') ? inspector : <p className="px-0.5 text-[11px] text-muted-foreground">Select a text layer to set its font, size, weight and alignment.</p>}
        </div>
      </div>
    ),
    colour: (
      <div className="space-y-3">
        {backgroundControl}
        <div>
          {sectionLabel('Colours in this design')}
          <div className="flex flex-wrap gap-1.5">
            {designColours.map(colour => (
              <button
                key={colour}
                type="button"
                title={selectedFillable ? `Apply ${colour} to ${selectedObject!.name}` : colour}
                onClick={() => { if (selectedFillable) applyIntent({ objectId: selectedObject!.id, property: 'fill', value: colour }) }}
                className="group flex flex-col items-center gap-0.5"
              >
                <span className="h-7 w-7 rounded-md border border-white/15 transition-transform group-hover:scale-110" style={{ backgroundColor: colour }} />
                <span className="font-mono text-[8px] text-muted-foreground">{colour}</span>
              </button>
            ))}
            {!designColours.length ? <p className="text-[11px] text-muted-foreground">No colours yet.</p> : null}
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
            {selectedFillable ? `Click a swatch to apply it to ${selectedObject!.name}.` : 'Select a layer, then click a swatch to apply it.'}
          </p>
        </div>
        {selectedFillable ? (
          <label className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-2 py-1.5">
            <span className="truncate text-[11px] text-muted-foreground">{selectedObject!.name} fill</span>
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(selectedObject!.style.fill || '') ? selectedObject!.style.fill! : '#ffffff'}
              onChange={event => applyIntent({ objectId: selectedObject!.id, property: 'fill', value: event.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
            />
          </label>
        ) : null}
        <div>
          {sectionLabel('Ask Spyda AI')}
          <div className="space-y-1">
            {['Give it a bold, modern colour palette', 'Make it feel warm and inviting', 'Raise the contrast so the text is easy to read'].map(idea => (
              <button
                key={idea}
                type="button"
                onClick={() => { setPage('ai'); runAssist(idea) }}
                disabled={assistBusy}
                className="block w-full rounded-md bg-white/[0.04] px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-50"
              >
                {idea}
              </button>
            ))}
          </div>
        </div>
      </div>
    ),
    media: (
      <div className="space-y-3">
        {quickAdd([['image', 'Add image']])}
        <div>
          {sectionLabel(`Pictures · ${imageLayers.length}`)}
          <div className="grid grid-cols-3 gap-1.5">
            {imageLayers.map(object => {
              const source = object.content.assetRef ? images[object.content.assetRef]?.src : undefined
              return (
                <button
                  key={object.id}
                  type="button"
                  onClick={() => selectLayer(object.id)}
                  title={object.name}
                  className={`aspect-square overflow-hidden rounded-md border transition-colors ${object.id === selectedId ? 'border-primary' : 'border-white/10 hover:border-white/30'}`}
                >
                  {source
                    ? <img src={source} alt={object.name} className="h-full w-full object-contain" />
                    : <span className="flex h-full items-center justify-center px-1 text-[9px] text-muted-foreground">{object.name}</span>}
                </button>
              )
            })}
          </div>
          {!imageLayers.length ? <p className="px-0.5 text-[11px] text-muted-foreground">No pictures yet.</p> : null}
        </div>
        {project.referencePreview ? (
          <div className="rounded-md bg-white/[0.03] p-2">
            {sectionLabel('Cut-outs')}
            <p className="text-[10px] leading-4 text-muted-foreground">Separate this flyer's pictures from their background so each one moves on its own.</p>
            <button
              type="button"
              onClick={handleExtract}
              disabled={Boolean(extracting) || !design}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {extracting ? 'Cutting out…' : extracted ? 'Refresh cut-outs' : 'Make it editable'}
            </button>
            {!cutoutTargets.length ? <p className="mt-1.5 text-[10px] text-muted-foreground">No pictures to cut out on this flyer.</p> : null}
          </div>
        ) : null}
        {selectedObject && imageLayers.some(object => object.id === selectedObject.id) ? (
          <div className="border-t border-white/[0.06] pt-3">{sectionLabel('Selected picture')}{inspector}</div>
        ) : null}
      </div>
    ),
    ai: (
      <AssistPanel entries={assistEntries} draft={assistDraft} setDraft={setAssistDraft} onSend={runAssist} busy={assistBusy} blank={blankCanvas} />
    ),
    history: steps.length ? (
      <ol className="space-y-0.5">
        <li>
          <button
            type="button"
            onClick={() => setHistory(current => (current ? jumpTo(current, 0) : current))}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.05] ${cursor === 0 ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Clock className="h-3 w-3" /> Original
          </button>
        </li>
        {steps.map((step, index) => {
          const Icon = stepIcon(step.intents)
          const applied = index < cursor
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => setHistory(current => (current ? jumpTo(current, index + 1) : current))}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.05] ${
                  index === cursor - 1 ? 'bg-primary/15 text-primary' : applied ? 'text-foreground/90' : 'text-muted-foreground/50 line-through'
                }`}
              >
                <Icon className="h-3 w-3 shrink-0" /> <span className="truncate">{step.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    ) : <p className="px-0.5 text-[11px] text-muted-foreground">Every edit lands here. Click one to go back to it.</p>,
    deliver: (
      <div className="space-y-3">
        <div>
          {sectionLabel('Format')}
          <div className="grid grid-cols-2 gap-1.5">
            {(['png', 'jpeg'] as const).map(format => (
              <button
                key={format}
                type="button"
                onClick={() => setDelivery(current => ({ ...current, format }))}
                aria-pressed={delivery.format === format}
                className={`h-8 rounded-md text-[11px] font-semibold ${delivery.format === format ? 'bg-white text-[#0b1210]' : 'bg-white/[0.05] text-muted-foreground hover:text-foreground'}`}
              >
                {format === 'png' ? 'PNG · sharpest' : 'JPEG · smaller'}
              </button>
            ))}
          </div>
        </div>
        <div>
          {sectionLabel('Size')}
          <div className="grid grid-cols-2 gap-1.5">
            {[1, 2].map(scale => (
              <button
                key={scale}
                type="button"
                onClick={() => setDelivery(current => ({ ...current, scale }))}
                aria-pressed={delivery.scale === scale}
                className={`h-8 rounded-md text-[11px] font-semibold ${delivery.scale === scale ? 'bg-white text-[#0b1210]' : 'bg-white/[0.05] text-muted-foreground hover:text-foreground'}`}
              >
                {scale}× · {(design?.canvas.width || 0) * scale} × {(design?.canvas.height || 0) * scale}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          {sectionLabel('File name')}
          <input
            value={delivery.name}
            onChange={event => setDelivery(current => ({ ...current, name: event.target.value }))}
            placeholder={project.name}
            className="h-8 w-full rounded-md border border-white/10 bg-[#08090a] px-2 text-[12px] outline-none focus:border-primary/50"
          />
        </label>
        <button
          type="button"
          onClick={() => handleExport(delivery)}
          disabled={exporting || !design}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-[12px] font-semibold text-primary-foreground transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export {delivery.format.toUpperCase()}
        </button>
        <p className="text-[10px] leading-4 text-muted-foreground">Exports exactly what is on the canvas, at the size you pick.</p>
      </div>
    ),
  }

  const pageTitle = pages.find(item => item.id === page)?.label

  return (
    <main className="figma-editor flex min-h-[100dvh] flex-col bg-[#0b0c0e] text-foreground lg:h-[100dvh] lg:flex-row lg:overflow-hidden">
      {/* Left: file, pages, layers */}
      <aside className="order-2 flex w-full shrink-0 flex-col border-t border-white/[0.06] bg-[#111214] lg:order-1 lg:h-full lg:w-[240px] lg:border-r lg:border-t-0">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] px-2.5">
          <button
            type="button"
            onClick={() => navigate('/workspace')}
            aria-label="Close canvas mode and go back to Spyda AI"
            title="Back to Spyda AI"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/[0.08]"
          >
            <img src="/assets/spyda-logo.png" alt="" className="h-5 w-5 object-contain" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[12px] font-semibold">{project.name}</h1>
            <p className="text-[10px] text-muted-foreground">{size}{saved ? ' · Saved' : ''}</p>
          </div>
        </div>

        <div className="shrink-0 border-b border-white/[0.06] px-2 py-2">
          <p className="mb-1 px-1.5 text-[10px] font-semibold text-muted-foreground">Pages</p>
          <div role="tablist" aria-label="Canvas pages" className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] lg:flex-col [&::-webkit-scrollbar]:hidden">
            {pages.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={page === item.id}
                onClick={() => setPage(item.id)}
                title={`${item.label} (Shift+${index + 1})`}
                className={`flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 text-[11px] transition-colors ${
                  page === item.id ? 'bg-white/[0.08] font-semibold text-foreground' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                }`}
              >
                <item.icon className={`h-3.5 w-3.5 ${page === item.id ? 'text-primary' : ''}`} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-2 py-2">
          <div className="mb-1 flex items-center justify-between px-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground">Layers</p>
            {missingAssets.length ? <span className="text-[10px] text-amber-300">{missingAssets.length} loading</span> : null}
          </div>
          <div className="mb-1.5 flex flex-wrap gap-1 px-0.5">
            {FILTERS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
                className={`h-5 rounded px-1.5 text-[9px] font-medium transition-colors ${filter === item.id ? 'bg-white/[0.12] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="editor-dense max-h-[40vh] min-h-0 flex-1 overflow-y-auto lg:max-h-none">
            <LayerList
              objects={filtered}
              selectedId={selectedId}
              onSelect={selectLayer}
              onReorder={handleReorder}
              onToggleVisibility={handleToggleVisibility}
              onDuplicate={handleDuplicate}
              onRemove={objectId => applyIntent({ objectId, property: 'removed', value: true })}
            />
          </div>
        </div>
      </aside>

      {/* Centre: the canvas, with the tools floating at the bottom like Figma */}
      <section className="editor-stage relative order-1 min-h-[70vh] flex-1 overflow-hidden lg:order-2 lg:min-h-0">
        <div className="absolute left-2 top-2 z-10 flex min-w-0 items-center gap-2 lg:left-3 lg:top-2.5">
          {/* On phones the file header sits below the canvas, so the way back is up here. */}
          <button
            type="button"
            onClick={() => navigate('/workspace')}
            aria-label="Back to Spyda AI"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black/40 text-muted-foreground lg:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <p className="pointer-events-none truncate text-[10px] text-muted-foreground">
            <span className="text-foreground/80">{project.name}</span> · {size}
          </p>
        </div>
        {notice ? (
          <div
            role="status"
            className={[
              'absolute inset-x-3 top-8 z-20 mx-auto flex max-w-xl items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] shadow-lg',
              notice.tone === 'error'
                ? 'border-destructive/30 bg-[#2a1214] text-red-200'
                : notice.tone === 'warn'
                  ? 'border-amber-400/25 bg-[#2a2210] text-amber-200'
                  : 'border-white/[0.08] bg-[#17181b] text-muted-foreground',
            ].join(' ')}
          >
            <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
            <span className="flex-1 truncate">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 underline">Dismiss</button>
          </div>
        ) : null}
        {missingFonts.size ? (
          <p className="absolute right-3 top-2.5 z-10 max-w-[50%] truncate text-[10px] text-amber-200">
            {[...missingFonts].join(', ')} not loaded · showing Montserrat
          </p>
        ) : null}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) handleImageFile(file)
            event.target.value = ''
          }}
        />
        {design ? (
          <LayerCanvas
            document={design}
            images={images}
            fallbackImage={flatFlyer}
            selectedId={selectedId}
            onSelect={selectLayer}
            onEditText={editText}
            onGeometryChange={(objectId, bounds, rotation) => applyStep([
              { objectId, property: 'bounds', value: bounds, explicitGeometryChange: true },
              { objectId, property: 'rotation', value: rotation, explicitGeometryChange: true },
            ], 'Move layer', `move:${objectId}`)}
            missingFonts={missingFonts}
            stageRef={stageRef}
            className="absolute inset-x-4 bottom-16 top-8 flex items-center justify-center"
          />
        ) : project.referencePreview ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <img src={project.referencePreview} alt="Reference flyer" className="max-h-[60vh] w-auto rounded-lg border border-white/10" />
            <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
              This flyer is still a flat picture. Open it from Spyda AI again so its parts become layers.
            </p>
          </div>
        ) : null}
        {extracting ? (
          <p className="absolute bottom-16 left-3 rounded-full bg-black/75 px-2.5 py-1 text-[10px] text-white backdrop-blur" role="status">
            {extracting.total ? `Cutting out layer ${extracting.done} of ${extracting.total}…` : 'Reading the flyer once to build its mask…'}
          </p>
        ) : null}
        <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-2">
          <CanvasToolbar
            onSelectTool={() => setSelectedId(null)}
            onAdd={kind => addLayer(kind)}
            onAssist={() => setPage('ai')}
            assistActive={page === 'ai'}
          />
        </div>
      </section>

      {/* Right: actions, then the current page's panel */}
      <aside className="order-3 flex min-h-[340px] w-full shrink-0 flex-col border-t border-white/[0.06] bg-[#111214] lg:h-full lg:min-h-0 lg:w-[264px] lg:border-l lg:border-t-0">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2.5">
          <button
            type="button"
            onClick={() => setHistory(current => (current ? undo(current) : current))}
            disabled={!history || !canUndo(history)}
            title={(history && nextUndoLabel(history)) || 'Nothing to undo'}
            aria-label="Undo"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setHistory(current => (current ? redo(current) : current))}
            disabled={!history || !canRedo(history)}
            title={(history && nextRedoLabel(history)) || 'Nothing to redo'}
            aria-label="Redo"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30"
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => handleExport(delivery)}
            disabled={exporting || !design}
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Download className="h-3 w-3" aria-hidden />}
            Export
          </button>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-white/[0.06] px-3">
          <h2 className="text-[11px] font-semibold">{pageTitle}</h2>
          {page === 'design' && selectedObject ? <span className="truncate text-[10px] text-muted-foreground">{selectedObject.name}</span> : null}
        </div>
        <div className={`min-h-0 flex-1 p-2.5 ${page === 'ai' ? 'flex flex-col' : 'overflow-y-auto'}`}>
          {panels[page]}
        </div>
      </aside>
    </main>
  )
}
