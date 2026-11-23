import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDownload } from '../components/DownloadProvider'
import {
  ArrowLeft, ChevronDown, Clapperboard, Clock, Copy, Download, Eye, Image as ImageIcon, Layers, Loader2, LogOut, Maximize2, Move, Palette, Play, Plus,
  Redo2, Sparkles, Square, Trash2, Type, Undo2, Wand2, X, type LucideIcon,
} from '../components/ui/icons'
import type Konva from 'konva'
import {
  adaptBreakdownToDesignDocument,
  designDocumentToLegacyBreakdown,
  type DesignDocument,
  type DesignObject,
  type PercentBox,
} from '../core/design-document'
import { CUTOUT_KINDS } from '../core/layer-extraction'
import type { DesignEditIntent } from '../core/constraint-engine'
import { putAsset } from '../lib/asset-store'
import { makeLayer, pathFromPoints, type NewLayerKind } from '../lib/editor-objects'
import { describeCanvas, translateOperations } from '../lib/canvas-assist'
import { prepareImage, requestCanvasAssist } from '../lib/chat'
import { spydaRequestHeaders } from '../lib/spyda-api'
import { loadSourceImage } from '../lib/cutout'
import { runMagicLayers } from '../lib/magic-layers'
import { loadDrawable, pictureAt4K, UHD_LONG_EDGE } from '../lib/image-4k'
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
import LayerCanvas from '../components/editor/LayerCanvas'
import PropertiesPanel from '../components/editor/PropertiesPanel'
import SelectionPanel, { type AlignMode } from '../components/editor/SelectionPanel'
import LayerList from '../components/editor/LayerList'
import AssetsPanel from '../components/editor/AssetsPanel'
import { useAssetImages } from '../components/editor/useAssetImages'
import AssistPanel, { type AssistEntry } from '../components/editor/AssistPanel'
import CanvasToolbar from '../components/editor/CanvasToolbar'
import EditorMenuBar, { type EditorMenu } from '../components/editor/EditorMenuBar'
import { hasMotion, magicAnimation, playLength } from '../lib/canvas-fx'

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
  'text', 'fill', 'stroke', 'opacity', 'fontFamily', 'fontSize', 'fontWeight', 'textAlign', 'bounds', 'rotation', 'fx', 'typography', 'lineHeight', 'letterSpacing',
])

/** Edits that turn a lifted (pixel) text layer into live text. */
const LIVE_TEXT_EDITS: ReadonlySet<DesignEditIntent['property']> = new Set([
  'text', 'fontFamily', 'fontSize', 'fontWeight', 'textAlign', 'fill', 'stroke', 'strokeWidth', 'letterSpacing', 'lineHeight', 'typography',
])

/**
 * Drops a lifted text layer's pixels and moves it to the box its live text
 * needs, keeping any move the person already made.
 */
function liveTextIntents(object: DesignObject): DesignEditIntent[] {
  const intents: DesignEditIntent[] = [{ objectId: object.id, property: 'assetRef', value: null }]
  const live = object.legacy?.liveTextBounds as PercentBox | undefined
  const lifted = object.legacy?.liftedBounds as PercentBox | undefined
  const now = object.transform.bounds
  if (live && lifted && now) {
    const x = Math.min(Math.max(0, live.x + (now.x - lifted.x)), Math.max(0, 100 - live.width))
    const y = Math.min(Math.max(0, live.y + (now.y - lifted.y)), Math.max(0, 100 - live.height))
    intents.push({ objectId: object.id, property: 'bounds', value: { ...live, x, y }, explicitGeometryChange: true })
  }
  return intents
}

function streamKey(intent: DesignEditIntent) {
  return CONTINUOUS_PROPERTIES.has(intent.property) ? `${intent.objectId}:${intent.property}` : undefined
}

type BootState = { project: StoredProject | null; history: IntentHistory | null }

/** The editor's pages, like a video editor's: one job each, the canvas always in the middle. */
type EditorPage = 'design' | 'text' | 'colour' | 'media' | 'animate' | 'ai' | 'deliver' | 'history'
const PAGE_ORDER: EditorPage[] = ['design', 'text', 'colour', 'media', 'animate', 'ai', 'deliver', 'history']
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
  const [selection, setSelection] = useState<string[]>([])
  const selectedId = selection.length ? selection[selection.length - 1] : null
  const setSelectedId = useCallback((id: string | null) => setSelection(id ? [id] : []), [])
  const [alignTo, setAlignTo] = useState<'selection' | 'frame'>('selection')
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
  }, [page, setSelectedId])
  const [filter, setFilter] = useState<LayerFilter>('all')
  const [assistEntries, setAssistEntries] = useState<AssistEntry[]>([])
  const [assistDraft, setAssistDraft] = useState('')
  const [assistBusy, setAssistBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const stageRef = useRef<Konva.Stage | null>(null)
  const [penPoints, setPenPoints] = useState<[number, number][] | null>(null)
  const [pictureBusy, setPictureBusy] = useState<'background' | 'magic' | null>(null)
  const [magic, setMagic] = useState<{ frame: PercentBox; label: string; progress: number } | null>(null)
  const autoMagic = useRef(false)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  // View: zoom is a multiple of "fit"; displayScale is screen pixels per design pixel.
  const [zoom, setZoom] = useState(1)
  const [displayScale, setDisplayScale] = useState(1)
  const [dock, setDock] = useState({ layers: true, navigator: true })
  const [lowerTab, setLowerTab] = useState<'navigator' | 'history'>('navigator')
  const [layerTab, setLayerTab] = useState<'layers' | 'assets'>('layers')
  const [layerQuery, setLayerQuery] = useState('')
  const [thumbnail, setThumbnail] = useState('')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [playing, setPlaying] = useState<number | null>(null)
  const [recording, setRecording] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const clipboard = useRef<DesignObject[] | null>(null)
  const styleClipboard = useRef<DesignObject['style'] | null>(null)
  const navigate = useNavigate()
  const download = useDownload()
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

  /** Leave canvas mode: save what is on the canvas now (not after the autosave delay), then back to Spyda AI. */
  const exitCanvas = useCallback(() => {
    if (design && edited.current) persist(design)
    navigate('/workspace')
  }, [design, navigate, persist])

  /** Leave for another route, saving first, like closing a document. */
  const leaveTo = useCallback((path: string) => {
    if (design && edited.current) persist(design)
    navigate(path)
  }, [design, navigate, persist])

  const zoomBy = useCallback((factor: number) => setZoom(current => Math.min(8, Math.max(0.25, current * factor))), [])
  /** 100%: one design pixel per screen pixel. */
  const zoomActual = useCallback(() => setZoom(current => Math.min(8, Math.max(0.25, current / Math.max(0.01, displayScale)))), [displayScale])

  // The navigator's miniature: the stage without selection handles, redrawn after edits settle.
  useEffect(() => {
    if (!design || !dock.navigator) return
    const timer = window.setTimeout(() => {
      const stage = stageRef.current
      if (!stage || !stage.width()) return
      const handles = stage.find('Transformer')
      handles.forEach(node => node.visible(false))
      try {
        setThumbnail(stage.toDataURL({ pixelRatio: Math.min(1, 220 / stage.width()) }))
      } catch {
        // A cross-origin picture taints the stage; the navigator then shows the frame only.
      } finally {
        handles.forEach(node => node.visible(true))
      }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [design, dock.navigator, images, flatFlyer])

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
      let result: ReturnType<typeof commitIntent>
      try {
        const lifted = LIVE_TEXT_EDITS.has(intent.property)
          ? currentDocument(current).objects.find(object => object.id === intent.objectId && (object.kind === 'text' || object.kind === 'action') && object.content.assetRef)
          : undefined
        result = lifted
          // The first edit to text Magic Layers lifted swaps its pixels for live text in the matched font.
          ? commitStep(current, [...liveTextIntents(lifted), intent], { label: 'Edit text' })
          : commitIntent(current, intent, key ? { coalesceKey: key } : {})
      } catch (error) {
        // A change the document cannot hold is refused, never a crash.
        reportRejection(error instanceof Error && !/ZodError|\[/.test(error.message) ? error.message : 'That change would put the layer outside the canvas.')
        return current
      }
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
      let result: ReturnType<typeof commitStep>
      try {
        result = commitStep(current, intents, { label, coalesceKey })
      } catch (error) {
        reportRejection(error instanceof Error && !/ZodError|\[/.test(error.message) ? error.message : 'That change would put the layer outside the canvas.')
        return current
      }
      if (!result.recorded) {
        reportRejection(result.violations[0]?.message)
        return current
      }
      edited.current = true
      setNotice(null)
      return result.history
    })
  }, [reportRejection])

  /**
   * Magic Layers over the whole flyer: live text in matched fonts, the subject
   * and marks as cut-outs, and a filled-in background, all at 4K. Replaces the
   * analyser's rough boxes so the canvas looks exactly like the flyer.
   */
  const handleExtract = useCallback(async () => {
    if (!design || !flatFlyer || magic) return
    const frame = { x: 0, y: 0, width: 100, height: 100 }
    setSelectedId(null)
    setExtracting({ done: 0, total: 0 })
    setMagic({ frame, label: 'Reading the flyer', progress: 0.02 })
    setNotice({ tone: 'info', text: 'Magic Layers is splitting this flyer. The first run downloads the cut-out model once.' })
    try {
      const result = await runMagicLayers({
        source: flatFlyer,
        document: design,
        analysed: design.objects.filter(object => !object.status.removed),
        frame,
        wholeFlyer: true,
        saveAsset: blob => putAsset(blob),
        onProgress: (label, progress) => setMagic({ frame, label, progress }),
      })
      const ids = result.objects.map(object => object.id)
      const sectionId = design.sections[0]?.id
      const next: DesignDocument = {
        ...design,
        objects: result.objects.map(object => ({ ...object, sectionId: sectionId ?? object.sectionId })),
        sections: design.sections.map((section, index) => ({ ...section, objectIds: index === 0 ? ids : [] })),
      }
      setHistory(current => (current ? adoptDocument(current, next) : createHistory(next)))
      persist(next)
      if (projectId) patchProject(projectId, { magicLayers: 'done' })
      const texts = result.objects.filter(object => object.kind === 'text').length
      const pictures = result.objects.length - texts
      setNotice(result.warnings.length
        ? { tone: 'warn', text: `Split into ${texts} text and ${pictures} picture layers. ${result.warnings.join(' ')}` }
        : { tone: 'info', text: `Split into ${texts} text and ${pictures} picture layers. Click any of them to edit it.` })
    } catch (error) {
      if (projectId) patchProject(projectId, { magicLayers: 'failed' })
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Magic Layers could not split this flyer.' })
    } finally {
      setMagic(null)
      setExtracting(null)
    }
  }, [design, flatFlyer, magic, persist, projectId, setSelectedId])

  // A flyer sent here from Spyda AI is split as soon as it opens, like Canva's Magic Layers.
  useEffect(() => {
    if (autoMagic.current || !project || project.magicLayers !== 'pending' || !design || !flatFlyer) return
    autoMagic.current = true
    void handleExtract()
  }, [design, flatFlyer, handleExtract, project])

  const handleReplaceImage = useCallback(async (objectId: string, file: File) => {
    try {
      setNotice({ tone: 'info', text: 'Rendering the picture at 4K…' })
      const id = await putAsset((await pictureAt4K(file)).blob)
      setNotice(null)
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
  }, [applyStep, design, setSelectedId])

  const handleImageFile = useCallback(async (file: File) => {
    if (!design) return
    try {
      // Every picture placed on the canvas is rendered at 4K, so it stays sharp at any zoom or export size.
      setNotice({ tone: 'info', text: 'Rendering the picture at 4K…' })
      const rendered = await pictureAt4K(file)
      const id = await putAsset(rendered.blob)
      const size = { width: rendered.width, height: rendered.height }
      setNotice(null)
      // As large as fits in 90% of the canvas, at the picture's own proportions,
      // centred: big enough to read its text and details without resizing it.
      const canvasRatio = (design.canvas.width || 1) / (design.canvas.height || 1)
      const pictureRatio = size.width / Math.max(1, size.height)
      let width = 90
      let height = (width * canvasRatio) / pictureRatio
      if (height > 90) { height = 90; width = (height * pictureRatio) / canvasRatio }
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
    const base = (options.name.trim() || project?.name || 'spyda-design').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'spyda-design'
    setExporting(true)
    try {
      // The download card charges for it once the picture is ready.
      await download({
        name: `${base}.${options.format === 'jpeg' ? 'jpg' : 'png'}`,
        kind: 'image',
        title: 'Download your design',
        produce: async () => {
          setSelectedId(null)
          // Let the selection handles disappear before the frame is captured.
          await new Promise(resolve => window.setTimeout(resolve, 80))
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
          const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, mimeType, 0.92))
          if (!blob) throw new Error('This design could not be exported. Remove any picture that failed to load and try again.')
          return blob
        },
      })
    } finally {
      setExporting(false)
    }
  }, [design, download, project?.name, setSelectedId])

  /** Pen tool: points in canvas percent until the path closes or Enter ends it. */
  const finishPen = useCallback((points: [number, number][], closed: boolean) => {
    setPenPoints(null)
    if (!design || points.length < 2) return
    const layer = pathFromPoints(design, points, closed && points.length >= 3)
    if (!layer) return
    applyStep([{ objectId: layer.id, property: 'create', value: layer }], closed ? 'Draw shape' : 'Draw path')
    setSelectedId(layer.id)
  }, [applyStep, design, setSelectedId])

  // Decided from the current points, never inside a state updater: updaters
  // must stay pure, and creating the layer there could run it twice.
  const addPenPoint = useCallback((point: [number, number]) => {
    const points = penPoints ?? []
    const first = points[0]
    // Clicking the first point again closes the shape.
    if (first && points.length >= 3 && Math.hypot(point[0] - first[0], point[1] - first[1]) < 2.2) {
      finishPen(points, true)
      return
    }
    setPenPoints([...points, point])
  }, [finishPen, penPoints])

  /** The pixels of a picture layer: its own asset, or its region of the flat flyer. */
  const pictureBlob = useCallback(async (object: DesignObject): Promise<Blob> => {
    const own = object.content.assetRef ? images[object.content.assetRef] : undefined
    if (own) return (await fetch(own.src)).blob()
    const bounds = object.transform.bounds
    if (!flatFlyer || !bounds) throw new Error('This picture has no pixels to work with yet.')
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((bounds.width / 100) * flatFlyer.naturalWidth))
    canvas.height = Math.max(1, Math.round((bounds.height / 100) * flatFlyer.naturalHeight))
    canvas.getContext('2d')?.drawImage(
      flatFlyer,
      (bounds.x / 100) * flatFlyer.naturalWidth, (bounds.y / 100) * flatFlyer.naturalHeight, canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height,
    )
    return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The picture could not be read.'))), 'image/png'))
  }, [flatFlyer, images])

  const handleRemoveBackground = useCallback(async (object: DesignObject) => {
    setPictureBusy('background')
    setNotice({ tone: 'info', text: 'Removing the background. The first time, the cut-out model downloads once.' })
    try {
      const source = await pictureBlob(object)
      const { removeBackground } = await import('@imgly/background-removal')
      const cutout = await removeBackground(source, { model: 'isnet_quint8' })
      const id = await putAsset((await pictureAt4K(cutout)).blob)
      applyStep([{ objectId: object.id, property: 'assetRef', value: `asset:${id}` }], 'Remove background')
      setNotice({ tone: 'info', text: 'Background removed. Undo brings it back.' })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The background could not be removed.' })
    } finally {
      setPictureBusy(null)
    }
  }, [applyStep, pictureBlob])

  /** What the analyser reads in a picture (its text and marks), in percent of that picture. */
  const analysePicture = useCallback(async (blob: Blob, name: string): Promise<DesignObject[]> => {
    const prepared = await prepareImage(new File([blob], `${name}.png`, { type: blob.type || 'image/png' }), 2048)
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await spydaRequestHeaders({ openai: '', groq: '' }, 'groq')) },
      body: JSON.stringify({
        base64Image: prepared.dataUrl,
        aiProvider: 'groq',
        sourceMetadata: { designId: `magic-${Date.now().toString(36)}`, width: prepared.width, height: prepared.height, fileName: prepared.name, mimeType: 'image/jpeg' },
      }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok || !data.breakdown) throw new Error(data?.error || 'The text in this picture could not be read.')
    return adaptBreakdownToDesignDocument(data.breakdown, {
      id: 'magic-analysis',
      provider: 'spyda-editor',
      sourceAsset: { fileName: name, mimeType: null },
    }).objects
  }, [])

  /**
   * Magic Layers on one picture, in place: the picture is replaced by its own
   * layers (filled background, subject, marks, live text) exactly where it was.
   * One undo puts the picture back.
   */
  const handleMagicLayers = useCallback(async (object: DesignObject) => {
    if (object.kind === 'background') { void handleExtract(); return }
    const frame = object.transform.bounds
    if (!design || !frame || magic) return
    setPictureBusy('magic')
    setSelectedId(null)
    setMagic({ frame, label: 'Reading the picture', progress: 0.02 })
    const warnings: string[] = []
    try {
      const blob = await pictureBlob(object)
      let analysed: DesignObject[] = []
      try {
        setMagic({ frame, label: 'Finding text and logos', progress: 0.06 })
        analysed = await analysePicture(blob, object.name)
      } catch {
        warnings.push('The text could not be read, so it stays part of the picture.')
      }
      const drawable = await loadDrawable(blob)
      const result = await runMagicLayers({
        source: drawable,
        document: design,
        analysed,
        frame,
        wholeFlyer: false,
        saveAsset: putBlob => putAsset(putBlob),
        onProgress: (label, progress) => setMagic({ frame, label, progress: 0.1 + progress * 0.9 }),
      })
      if ('close' in drawable) drawable.close()
      applyStep([
        { objectId: object.id, property: 'removed', value: true },
        ...result.objects.map(layer => ({ objectId: layer.id, property: 'create' as const, value: layer })),
      ], 'Magic layers')
      const texts = result.objects.filter(layer => layer.kind === 'text').length
      const all = [...warnings, ...result.warnings]
      // After the step lands: committing an edit clears the notice line.
      window.setTimeout(() => setNotice({
        tone: all.length ? 'warn' : 'info',
        text: `Split into ${result.objects.length} layers${texts ? `, ${texts} of them live text` : ''}. Undo puts the picture back.${all.length ? ` ${all.join(' ')}` : ''}`,
      }), 0)
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Magic layers could not split this picture.' })
    } finally {
      setMagic(null)
      setPictureBusy(null)
    }
  }, [analysePicture, applyStep, design, handleExtract, magic, pictureBlob, setSelectedId])

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
      // While drawing, the pen owns Enter, Escape and Backspace.
      if (penPoints) {
        if (event.key === 'Enter') { event.preventDefault(); finishPen(penPoints, false); return }
        if (event.key === 'Escape') { event.preventDefault(); setPenPoints(null); return }
        if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); setPenPoints(penPoints.slice(0, -1)); return }
      }
      const selected = selectedId ? design?.objects.find(object => object.id === selectedId) : null
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedId) {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAll(); return }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); if (event.shiftKey) ungroupSelection(); else groupSelection(); return }
      if (event.metaKey || event.ctrlKey) {
        if (event.key === '=' || event.key === '+') { event.preventDefault(); zoomBy(1.25); return }
        if (event.key === '-') { event.preventDefault(); zoomBy(0.8); return }
        if (event.key === '0') { event.preventDefault(); setZoom(1); return }
        if (event.key === '1') { event.preventDefault(); zoomActual(); return }
      }
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase()
        if (key === 'c' && event.shiftKey) { event.preventDefault(); copyStyle(); return }
        if (key === 'v' && event.shiftKey) { event.preventDefault(); pasteStyle(); return }
        if (key === 'c') { if (copySelected()) event.preventDefault(); return }
        if (key === 'x' && selectedId) { event.preventDefault(); if (copySelected()) deleteSelection(); return }
        if (key === 'v' && clipboard.current) { event.preventDefault(); pasteClipboard(); return }
        if (event.key === ']' && selectedId) { event.preventDefault(); if (event.shiftKey) moveToEdge(selectedId, 'front'); else handleReorder(selectedId, 'up'); return }
        if (event.key === '[' && selectedId) { event.preventDefault(); if (event.shiftKey) moveToEdge(selectedId, 'back'); else handleReorder(selectedId, 'down'); return }
        if (event.key === 'Enter') { event.preventDefault(); if (playing != null) setPlaying(null); else play(); return }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '?') { setShowShortcuts(value => !value); return }
      const pageIndex = event.shiftKey ? Number(event.code.replace('Digit', '')) - 1 : -1
      if (pageIndex >= 0 && pageIndex < PAGE_ORDER.length) {
        event.preventDefault()
        setPage(PAGE_ORDER[pageIndex])
        return
      }
      if (event.key === 'Escape') { setSelectedId(null); setContextMenu(null); setPlaying(null) }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        deleteSelection()
        return
      }
      const tool = ({ v: 'select', t: 'text', r: 'rect', o: 'circle', i: 'image', l: 'line', p: 'pen' } as const)[event.key.toLowerCase() as 'v' | 't' | 'r' | 'o' | 'i' | 'l' | 'p']
      if (tool) {
        event.preventDefault()
        if (tool === 'select') { setSelectedId(null); setPenPoints(null) }
        else if (tool === 'pen') { setSelectedId(null); setPenPoints(current => (current ? null : [])) }
        else addLayer(tool)
        return
      }
      // Arrow keys nudge the selection; shift moves further. One undo per burst.
      const step = event.shiftKey ? 2 : 0.5
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key as 'ArrowLeft']
      if (delta && selection.length > 1) { event.preventDefault(); nudgeSelection(delta[0], delta[1]); return }
      if (delta && selected?.transform.bounds && !selected.protection.locked && !selected.constraints.lockPosition) {
        event.preventDefault()
        const bounds = selected.transform.bounds
        applyStep([{
          objectId: selected.id,
          property: 'bounds',
          value: {
            ...bounds,
            // Clamp after rounding, so a nudge that reaches the edge never rounds past it.
            x: Math.min(Math.max(0, Math.round((bounds.x + delta[0]) * 10) / 10), Math.max(0, 100 - bounds.width)),
            y: Math.min(Math.max(0, Math.round((bounds.y + delta[1]) * 10) / 10), Math.max(0, 100 - bounds.height)),
          },
          explicitGeometryChange: true,
        }], 'Nudge layer', `move:${selected.id}`)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  /** A grouped layer brings its whole group, unless `exact` (Alt-click) picks just it. */
  const groupOf = (objectId: string) => {
    const group = design?.objects.find(object => object.id === objectId)?.relationships.groupId
    return group && design
      ? design.objects.filter(object => object.relationships.groupId === group && !object.status.removed).map(object => object.id)
      : [objectId]
  }

  const selectLayer = (objectId: string | null, mode: 'replace' | 'toggle' = 'replace', exact = false) => {
    setContextMenu(null)
    if (!objectId) { setSelection([]); return }
    const members = exact ? [objectId] : groupOf(objectId)
    const ordered = [...members.filter(id => id !== objectId), objectId]
    if (mode === 'toggle') {
      setSelection(current => (members.every(id => current.includes(id))
        ? current.filter(id => !members.includes(id))
        : [...current.filter(id => !members.includes(id)), ...ordered]))
    } else setSelection(ordered)
  }

  const selectMany = (objectIds: string[], additive: boolean) => {
    setContextMenu(null)
    const expanded = [...new Set(objectIds.flatMap(id => groupOf(id)))]
    setSelection(current => (additive ? [...new Set([...current, ...expanded])] : expanded))
  }

  const selectAll = () => {
    if (!design) return
    setSelection(design.objects.filter(object => !object.status.removed && object.status.visible && object.kind !== 'background' && !object.protection.locked).map(object => object.id))
  }

  const selectedObjects = (design?.objects ?? []).filter(object => selection.includes(object.id) && !object.status.removed)
  const editableSelection = selectedObjects.filter(object => !object.protection.locked && object.kind !== 'background')
  const multi = selectedObjects.length > 1

  /* ── many layers at once ──────────────────────────────────────────── */

  const unionOf = (objects: DesignObject[]) => {
    const boxes = objects.map(object => object.transform.bounds).filter((box): box is PercentBox => Boolean(box))
    const x0 = Math.min(...boxes.map(box => box.x)), y0 = Math.min(...boxes.map(box => box.y))
    const x1 = Math.max(...boxes.map(box => box.x + box.width)), y1 = Math.max(...boxes.map(box => box.y + box.height))
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  }

  const alignMany = (mode: AlignMode) => {
    const movable = editableSelection.filter(object => object.transform.bounds && !object.constraints.lockPosition)
    if (!movable.length) return
    const frame = alignTo === 'frame' || movable.length === 1 ? { x: 0, y: 0, width: 100, height: 100 } : unionOf(movable)
    const intents: DesignEditIntent[] = movable.map(object => {
      const b = object.transform.bounds!
      const next = {
        left: { x: frame.x }, center: { x: frame.x + (frame.width - b.width) / 2 }, right: { x: frame.x + frame.width - b.width },
        top: { y: frame.y }, middle: { y: frame.y + (frame.height - b.height) / 2 }, bottom: { y: frame.y + frame.height - b.height },
      }[mode]
      return { objectId: object.id, property: 'bounds', value: { ...b, ...next }, explicitGeometryChange: true }
    })
    applyStep(intents, `Align ${mode}`)
  }

  /** Equal gaps between the layers, keeping the outermost two where they are. */
  const distribute = (axis: 'x' | 'y') => {
    const movable = editableSelection.filter(object => object.transform.bounds && !object.constraints.lockPosition)
    if (movable.length < 3) return
    const size = (b: PercentBox) => (axis === 'x' ? b.width : b.height)
    const start = (b: PercentBox) => (axis === 'x' ? b.x : b.y)
    const sorted = [...movable].sort((a, b) => start(a.transform.bounds!) + size(a.transform.bounds!) / 2 - (start(b.transform.bounds!) + size(b.transform.bounds!) / 2))
    const first = sorted[0].transform.bounds!, last = sorted[sorted.length - 1].transform.bounds!
    const span = start(last) + size(last) - start(first)
    const gap = (span - sorted.reduce((sum, object) => sum + size(object.transform.bounds!), 0)) / (sorted.length - 1)
    let cursor = start(first)
    const intents: DesignEditIntent[] = sorted.map(object => {
      const b = object.transform.bounds!
      const value = axis === 'x' ? { ...b, x: cursor } : { ...b, y: cursor }
      cursor += size(b) + gap
      return { objectId: object.id, property: 'bounds', value, explicitGeometryChange: true }
    })
    applyStep(intents, axis === 'x' ? 'Spread across' : 'Spread down')
  }

  const groupSelection = () => {
    if (editableSelection.length < 2) return
    const groupId = `group-${newObjectId().slice(6)}`
    applyStep(editableSelection.map(object => ({ objectId: object.id, property: 'groupId' as const, value: groupId })), 'Group')
  }

  const ungroupSelection = () => {
    const grouped = editableSelection.filter(object => object.relationships.groupId)
    if (grouped.length) applyStep(grouped.map(object => ({ objectId: object.id, property: 'groupId' as const, value: null })), 'Ungroup')
  }

  /** Copies of every selected layer; grouped copies form a new group of their own. */
  const duplicateSelection = () => {
    if (!editableSelection.length) return
    const groups = new Map<string, string>()
    const intents: DesignEditIntent[] = []
    const created: string[] = []
    for (const object of editableSelection) {
      const id = newObjectId()
      created.push(id)
      intents.push({ objectId: object.id, property: 'duplicate', value: { id, name: `${object.name} copy`.slice(0, 60) } })
      const group = object.relationships.groupId
      if (group) {
        if (!groups.has(group)) groups.set(group, `group-${newObjectId().slice(6)}`)
        intents.push({ objectId: id, property: 'groupId', value: groups.get(group) })
      }
    }
    applyStep(intents, editableSelection.length > 1 ? `Duplicate ${editableSelection.length} layers` : 'Duplicate')
    setSelection(created)
  }

  const deleteSelection = () => {
    if (!editableSelection.length) return
    applyStep(editableSelection.map(object => ({ objectId: object.id, property: 'removed' as const, value: true })), editableSelection.length > 1 ? `Delete ${editableSelection.length} layers` : 'Delete layer')
    setSelection([])
  }

  const nudgeSelection = (dx: number, dy: number) => {
    const movable = editableSelection.filter(object => object.transform.bounds && !object.constraints.lockPosition)
    if (!movable.length) return
    // The whole selection stops at the canvas edge together, keeping its shape.
    const union = unionOf(movable)
    const sx = Math.min(Math.max(dx, -union.x), 100 - union.x - union.width)
    const sy = Math.min(Math.max(dy, -union.y), 100 - union.y - union.height)
    applyStep(movable.map(object => {
      const b = object.transform.bounds!
      return {
        objectId: object.id,
        property: 'bounds' as const,
        value: {
          ...b,
          x: Math.min(Math.max(0, Math.round((b.x + sx) * 100) / 100), Math.max(0, 100 - b.width)),
          y: Math.min(Math.max(0, Math.round((b.y + sy) * 100) / 100), Math.max(0, 100 - b.height)),
        },
        explicitGeometryChange: true,
      }
    }), 'Nudge layers', `move:${movable.map(object => object.id).join(',')}`)
  }

  /* ── arrange, clipboard and style ─────────────────────────────────── */

  const moveToEdge = (objectId: string, edge: 'front' | 'back') => {
    if (!design) return
    const others = design.objects.filter(object => object.id !== objectId && object.kind !== 'background' && !object.status.removed)
    const z = edge === 'front'
      ? Math.max(0, ...others.map(object => object.zIndex)) + 1
      : Math.min(...others.map(object => object.zIndex), 1) - 1
    applyIntent({ objectId, property: 'zIndex', value: z })
  }

  const copySelected = () => {
    const objects = editableSelection.length ? editableSelection : selectedObjects.filter(object => object.kind !== 'background')
    if (objects.length) clipboard.current = objects.map(object => structuredClone(object))
    return objects.length > 0
  }

  const pasteClipboard = () => {
    const sources = clipboard.current
    if (!design || !sources?.length) return
    let z = Math.max(0, ...design.objects.map(object => object.zIndex))
    const groups = new Map<string, string>()
    const copies = sources.map(source => {
      const copy: DesignObject = structuredClone(source)
      copy.id = newObjectId()
      copy.name = `${source.name} copy`.slice(0, 60)
      copy.zIndex = ++z
      copy.status = { visible: true, removed: false, consumed: false }
      copy.protection = { ...copy.protection, locked: false }
      const group = source.relationships.groupId
      if (group) {
        if (!groups.has(group)) groups.set(group, `group-${newObjectId().slice(6)}`)
        copy.relationships = { ...copy.relationships, groupId: groups.get(group)! }
      }
      const bounds = source.transform.bounds
      if (bounds) {
        copy.transform.bounds = {
          ...bounds,
          x: Math.min(Math.max(0, bounds.x + 2), Math.max(0, 100 - bounds.width)),
          y: Math.min(Math.max(0, bounds.y + 2), Math.max(0, 100 - bounds.height)),
        }
      }
      return copy
    })
    applyStep(copies.map(copy => ({ objectId: copy.id, property: 'create' as const, value: copy })), copies.length > 1 ? `Paste ${copies.length} layers` : 'Paste')
    setSelection(copies.map(copy => copy.id))
    // The next paste lands a step further on.
    clipboard.current = copies
  }

  const copyStyle = () => {
    const object = design?.objects.find(item => item.id === selectedId)
    if (object) {
      styleClipboard.current = structuredClone(object.style)
      setNotice({ tone: 'info', text: `Copied the style of ${object.name}. Select a layer and paste it with Ctrl+Shift+V.` })
    }
  }

  const pasteStyle = () => {
    const style = styleClipboard.current
    const target = design?.objects.find(item => item.id === selectedId)
    if (!style || !target || target.protection.locked) return
    const can = (property: string) => target.protection.editableProperties.includes(property)
    const isText = target.kind === 'text' || target.kind === 'action'
    const intents: DesignEditIntent[] = [{ objectId: target.id, property: 'fx', value: { ...(style.fx ?? {}) } }]
    if (can('fill') && style.fill) intents.push({ objectId: target.id, property: 'fill', value: style.fill })
    if (can('stroke')) intents.push({ objectId: target.id, property: 'stroke', value: style.stroke ?? '' })
    if (can('strokeWidth') && style.strokeWidth != null) intents.push({ objectId: target.id, property: 'strokeWidth', value: style.strokeWidth })
    if (can('borderRadius') && style.borderRadius != null) intents.push({ objectId: target.id, property: 'borderRadius', value: style.borderRadius })
    if (isText) {
      if (can('fontFamily') && style.fontFamily) intents.push({ objectId: target.id, property: 'fontFamily', value: style.fontFamily })
      if (can('fontWeight') && style.fontWeight) intents.push({ objectId: target.id, property: 'fontWeight', value: style.fontWeight })
      if (can('letterSpacing') && style.letterSpacing != null) intents.push({ objectId: target.id, property: 'letterSpacing', value: style.letterSpacing })
      if (can('lineHeight') && style.lineHeight != null) intents.push({ objectId: target.id, property: 'lineHeight', value: style.lineHeight })
    }
    applyStep(intents, 'Paste style')
  }

  /* ── motion ───────────────────────────────────────────────────────── */

  const play = () => {
    if (!design) return
    setSelectedId(null)
    setContextMenu(null)
    setPlaying(performance.now())
  }
  const stopPlaying = useCallback(() => setPlaying(null), [])

  const magicAnimate = () => {
    if (!design) return
    const plan = magicAnimation(design.objects)
    const intents: DesignEditIntent[] = []
    for (const [objectId, motion] of plan) {
      const object = design.objects.find(item => item.id === objectId)
      if (!object || object.protection.locked) continue
      intents.push({ objectId, property: 'fx', value: motion })
    }
    if (!intents.length) return
    applyStep(intents, 'Magic Animate')
    window.setTimeout(() => { setSelectedId(null); setPlaying(performance.now()) }, 60)
  }

  const clearAnimations = () => {
    if (!design) return
    const intents = design.objects
      .filter(object => !object.protection.locked && (object.style.fx?.enter || object.style.fx?.loop))
      .map(object => ({ objectId: object.id, property: 'fx' as const, value: { enter: null, loop: null } }))
    if (intents.length) applyStep(intents, 'Remove animations')
    setPlaying(null)
  }

  /**
   * The design as a video: playback drawn frame by frame into a recorder at up
   * to 1920 px wide. MP4 where the browser can write it, otherwise WebM.
   */
  const exportVideo = async () => {
    const stage = stageRef.current
    if (!stage || !design || recording) return
    if (typeof MediaRecorder === 'undefined') {
      setNotice({ tone: 'error', text: 'This browser cannot record video. Try Chrome or Edge.' })
      return
    }
    const type = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(candidate => MediaRecorder.isTypeSupported(candidate))
    if (!type) { setNotice({ tone: 'error', text: 'This browser cannot record video.' }); return }
    const layer = stage.getLayers()[0]
    if (!layer) return
    const base = (delivery.name.trim() || project?.name || 'spyda-motion').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'spyda-motion'
    const length = playLength(design.objects)
    // The download card records the animation, compresses it when asked, then charges for it.
    const saved = await download({
      name: `${base}.${type.includes('mp4') ? 'mp4' : 'webm'}`,
      kind: 'video',
      title: 'Download your animation',
      produce: async report => {
        setSelectedId(null)
        setRecording(true)
        try {
          await new Promise(resolve => window.setTimeout(resolve, 120))
          const width = Math.min(1920, design.canvas.width || 1080)
          const ratio = width / stage.width()
          const out = document.createElement('canvas')
          out.width = Math.round((stage.width() * ratio) / 2) * 2
          out.height = Math.round((stage.height() * ratio) / 2) * 2
          const context = out.getContext('2d')!
          const previous = layer.getCanvas().getPixelRatio()
          layer.getCanvas().setPixelRatio(ratio)
          layer.draw()
          const stream = out.captureStream(30)
          const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 14_000_000 })
          const chunks: Blob[] = []
          recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
          const done = new Promise<void>(resolve => { recorder.onstop = () => resolve() })
          const start = performance.now()
          setPlaying(start)
          recorder.start()
          const frame = () => {
            context.fillStyle = '#ffffff'
            context.fillRect(0, 0, out.width, out.height)
            context.drawImage(layer.getNativeCanvasElement(), 0, 0, out.width, out.height)
            const elapsed = performance.now() - start
            report(Math.min(1, elapsed / (length * 1000 + 250)), 'Recording your animation…')
            if (elapsed < length * 1000 + 250) requestAnimationFrame(frame)
            else recorder.stop()
          }
          requestAnimationFrame(frame)
          await done
          layer.getCanvas().setPixelRatio(previous)
          layer.draw()
          return new Blob(chunks, { type: type.split(';')[0] })
        } finally {
          setPlaying(null)
          setRecording(false)
        }
      },
    })
    if (saved) setNotice({ tone: 'info', text: `Exported a ${Math.round(length * 10) / 10}s video.` })
  }

  const editText = (objectId: string) => {
    const object = design?.objects.find(item => item.id === objectId)
    if (!object || !matchesFilter(object, 'text')) return
    setSelectedId(objectId)
    setPage(current => (current === 'animate' ? current : 'design'))
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
    { id: 'animate', label: 'Animate', icon: Clapperboard },
    { id: 'ai', label: 'Spyda AI', icon: Sparkles },
    { id: 'deliver', label: 'Deliver', icon: Download },
    { id: 'history', label: 'History', icon: Clock },
  ]

  const selectionPanel = multi ? (
    <SelectionPanel
      objects={selectedObjects}
      onAlign={alignMany}
      onDistribute={distribute}
      onGroup={groupSelection}
      onUngroup={ungroupSelection}
      onDuplicate={duplicateSelection}
      onDelete={deleteSelection}
      onOpacity={value => applyStep(editableSelection.map(object => ({ objectId: object.id, property: 'opacity' as const, value })), 'Opacity', 'opacity:selection')}
      onFx={patch => applyStep(editableSelection.map(object => ({ objectId: object.id, property: 'fx' as const, value: patch })), 'Effects', `fx:${selection.join(',')}`)}
      onPreview={play}
      alignTo={alignTo}
      onAlignTo={setAlignTo}
    />
  ) : null

  const inspector = selectedObject ? (
    <PropertiesPanel
      object={selectedObject}
      image={selectedObject.content.assetRef ? images[selectedObject.content.assetRef] : undefined}
      canvas={{ width: design?.canvas.width || 1080, height: design?.canvas.height || 1350 }}
      onIntent={applyIntent}
      onReplaceImage={file => handleReplaceImage(selectedObject.id, file)}
      onRemoveBackground={() => handleRemoveBackground(selectedObject)}
      onMagicLayers={() => handleMagicLayers(selectedObject)}
      onDuplicate={() => handleDuplicate(selectedObject.id)}
      onDelete={() => applyIntent({ objectId: selectedObject.id, property: 'removed', value: true })}
      onReorder={direction => handleReorder(selectedObject.id, direction)}
      pictureBusy={pictureBusy}
      onPreview={play}
    />
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
    design: multi ? (
      <div>
        {sectionLabel('Selection')}
        {selectionPanel}
      </div>
    ) : selectedObject ? (
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
            <p className="text-[10px] leading-4 text-muted-foreground">Split the flyer into live text, its subject, its logos and a filled-in background, so each part moves and edits on its own.</p>
            <button
              type="button"
              onClick={handleExtract}
              disabled={Boolean(extracting) || !design}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {extracting ? 'Splitting…' : extracted ? 'Run Magic Layers again' : 'Magic Layers'}
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
    animate: (
      <div className="space-y-3">
        <div className="rounded-lg border border-primary/25 bg-[linear-gradient(140deg,rgba(157,250,176,0.12),rgba(18,134,111,0.05))] p-3">
          <p className="text-[12px] font-semibold">Magic Animate</p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">One click choreographs the whole design: the background settles, the subject rises, the headline pops, small print fades in, top to bottom.</p>
          <button type="button" onClick={magicAnimate} disabled={!design} className="mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[11px] font-semibold text-primary-foreground disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" /> Animate everything
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => (playing != null ? setPlaying(null) : play())} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-white/[0.06] text-[11px] font-semibold hover:bg-white/[0.12]">
            {playing != null ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />} {playing != null ? 'Stop' : 'Play'}
          </button>
          <button type="button" onClick={clearAnimations} disabled={!hasMotion(objects)} className="inline-flex h-8 items-center justify-center rounded-md bg-white/[0.06] text-[11px] font-semibold hover:bg-white/[0.12] disabled:opacity-40">Remove all</button>
        </div>
        <div>
          {sectionLabel('Timeline')}
          <div className="space-y-1">
            {[...live].filter(object => object.kind !== 'background').sort((a, b) => (a.style.fx?.enter?.delay ?? 99) - (b.style.fx?.enter?.delay ?? 99)).map(object => {
              const enter = object.style.fx?.enter
              const total = Math.max(1, playLength(objects))
              return (
                <button key={object.id} type="button" onClick={() => selectLayer(object.id)} className={`block w-full rounded-md px-2 py-1.5 text-left transition-colors ${object.id === selectedId ? 'bg-primary/15' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                  <span className="flex items-center justify-between gap-2 text-[11px]"><span className="truncate">{object.name}</span><span className="shrink-0 text-[9px] capitalize text-muted-foreground">{enter ? enter.type.replace('-', ' ') : 'still'}{object.style.fx?.loop ? ` · ${object.style.fx.loop}` : ''}</span></span>
                  <span className="relative mt-1 block h-1 rounded-full bg-white/[0.06]">
                    {enter ? <span className="absolute inset-y-0 rounded-full bg-primary" style={{ left: `${(enter.delay / total) * 100}%`, width: `${Math.max(2, (enter.duration / total) * 100)}%` }} /> : null}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">Select a layer to choose its entrance, timing and loop in Properties.</p>
        </div>
        {multi ? <div className="border-t border-white/[0.06] pt-2">{selectionPanel}</div> : selectedObject && selectedObject.kind !== 'background' ? <div className="border-t border-white/[0.06] pt-2">{inspector}</div> : null}
        <button type="button" onClick={() => { void exportVideo() }} disabled={recording || !hasMotion(objects)} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-white text-[12px] font-semibold text-[#0b1210] disabled:opacity-40">
          {recording ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
          {recording ? 'Recording…' : 'Export video'}
        </button>
      </div>
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
            {[1, 2, UHD_LONG_EDGE / Math.max(1, design?.canvas.width || 0, design?.canvas.height || 0)].map((scale, index) => (
              <button
                key={scale}
                type="button"
                onClick={() => setDelivery(current => ({ ...current, scale }))}
                aria-pressed={delivery.scale === scale}
                className={`h-8 rounded-md text-[11px] font-semibold ${delivery.scale === scale ? 'bg-white text-[#0b1210]' : 'bg-white/[0.05] text-muted-foreground hover:text-foreground'}`}
              >
                {index === 2 ? '4K' : `${scale}×`} · {Math.round((design?.canvas.width || 0) * scale)} × {Math.round((design?.canvas.height || 0) * scale)}
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
        <div className="border-t border-white/[0.06] pt-3">
          {sectionLabel('Video')}
          <button type="button" onClick={() => { void exportVideo() }} disabled={recording || !hasMotion(objects)} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-white/[0.08] text-[12px] font-semibold disabled:opacity-40">
            {recording ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
            {recording ? 'Recording…' : 'Export animated video'}
          </button>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{hasMotion(objects) ? `Plays every animation into an MP4 (or WebM), ${Math.round(playLength(objects) * 10) / 10}s long.` : 'Add animation on the Animate page first, or use Magic Animate.'}</p>
        </div>
      </div>
    ),
  }

  const pageTitle = pages.find(item => item.id === page)?.label

  const movable = Boolean(selectedObject?.transform.bounds && !selectedObject.protection.locked && !selectedObject.constraints.lockPosition && selectedObject.kind !== 'background')
  const selectedPicture = Boolean(selectedObject && ['image', 'logo', 'icon'].includes(selectedObject.kind))
  const alignSelected = (where: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const bounds = selectedObject?.transform.bounds
    if (!selectedObject || !bounds || !movable) return
    const next = {
      left: { x: 0 }, center: { x: (100 - bounds.width) / 2 }, right: { x: 100 - bounds.width },
      top: { y: 0 }, middle: { y: (100 - bounds.height) / 2 }, bottom: { y: 100 - bounds.height },
    }[where]
    applyStep([{ objectId: selectedObject.id, property: 'bounds', value: { ...bounds, ...next }, explicitGeometryChange: true }], `Align ${where}`)
  }
  const flipSelected = (axis: 'flipX' | 'flipY') => {
    if (!selectedObject || selectedObject.protection.locked) return
    applyIntent({ objectId: selectedObject.id, property: axis, value: !selectedObject.transform[axis] })
  }
  const exportAs = (format: Delivery['format']) => {
    const next = { ...delivery, format }
    setDelivery(next)
    handleExport(next)
  }
  const choosePen = () => { setSelectedId(null); setPenPoints(current => (current ? null : [])) }
  const zoomPercent = Math.round(displayScale * 100)
  const noSelection = !selectedObject

  const menus: EditorMenu[] = [
    {
      label: 'File',
      items: [
        { label: 'New canvas…', onSelect: () => leaveTo('/editor/new') },
        { label: 'Place image…', shortcut: 'I', onSelect: () => imageInputRef.current?.click() },
        { separator: true },
        { label: 'Export PNG', onSelect: () => exportAs('png'), disabled: !design || exporting },
        { label: 'Export JPEG', onSelect: () => exportAs('jpeg'), disabled: !design || exporting },
        { label: 'Export settings…', onSelect: () => setPage('deliver') },
        { separator: true },
        { label: 'Save and close', onSelect: exitCanvas },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: history && canUndo(history) ? `Undo ${nextUndoLabel(history) ?? ''}`.trim() : 'Undo', shortcut: 'Ctrl+Z', onSelect: () => setHistory(current => (current ? undo(current) : current)), disabled: !history || !canUndo(history) },
        { label: history && canRedo(history) ? `Redo ${nextRedoLabel(history) ?? ''}`.trim() : 'Redo', shortcut: 'Ctrl+Shift+Z', onSelect: () => setHistory(current => (current ? redo(current) : current)), disabled: !history || !canRedo(history) },
        { separator: true },
        { label: 'Cut', shortcut: 'Ctrl+X', onSelect: () => { if (copySelected()) deleteSelection() }, disabled: noSelection },
        { label: 'Copy', shortcut: 'Ctrl+C', onSelect: () => { copySelected() }, disabled: noSelection },
        { label: 'Select all', shortcut: 'Ctrl+A', onSelect: selectAll },
        { label: 'Paste', shortcut: 'Ctrl+V', onSelect: pasteClipboard, disabled: !clipboard.current },
        { label: 'Copy style', shortcut: 'Ctrl+Shift+C', onSelect: copyStyle, disabled: noSelection },
        { label: 'Paste style', shortcut: 'Ctrl+Shift+V', onSelect: pasteStyle, disabled: noSelection || !styleClipboard.current },
        { separator: true },
        { label: 'Duplicate', shortcut: 'Ctrl+D', onSelect: duplicateSelection, disabled: noSelection },
        { label: 'Delete', shortcut: 'Del', onSelect: deleteSelection, disabled: noSelection },
        { label: 'Deselect', shortcut: 'Esc', onSelect: () => setSelectedId(null), disabled: noSelection },
      ],
    },
    {
      label: 'Layer',
      items: [
        { label: 'Group', shortcut: 'Ctrl+G', onSelect: groupSelection, disabled: editableSelection.length < 2 },
        { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', onSelect: ungroupSelection, disabled: !editableSelection.some(object => object.relationships.groupId) },
        { separator: true },
        { label: 'Bring to front', shortcut: 'Ctrl+Shift+]', onSelect: () => selectedObject && moveToEdge(selectedObject.id, 'front'), disabled: noSelection },
        { label: 'Bring forward', shortcut: 'Ctrl+]', onSelect: () => selectedObject && handleReorder(selectedObject.id, 'up'), disabled: noSelection },
        { label: 'Send backward', shortcut: 'Ctrl+[', onSelect: () => selectedObject && handleReorder(selectedObject.id, 'down'), disabled: noSelection },
        { label: 'Send to back', shortcut: 'Ctrl+Shift+[', onSelect: () => selectedObject && moveToEdge(selectedObject.id, 'back'), disabled: noSelection },
        { separator: true },
        { label: 'Flip horizontal', onSelect: () => flipSelected('flipX'), disabled: noSelection, checked: selectedObject ? Boolean(selectedObject.transform.flipX) : undefined },
        { label: 'Flip vertical', onSelect: () => flipSelected('flipY'), disabled: noSelection, checked: selectedObject ? Boolean(selectedObject.transform.flipY) : undefined },
        { label: 'Hide / show', onSelect: () => selectedObject && handleToggleVisibility(selectedObject), disabled: noSelection },
        { separator: true },
        { label: 'Remove background', onSelect: () => selectedObject && handleRemoveBackground(selectedObject), disabled: !selectedPicture || Boolean(pictureBusy) },
        { label: 'Magic layers', onSelect: () => selectedObject && handleMagicLayers(selectedObject), disabled: !selectedPicture || Boolean(pictureBusy) },
        { label: 'Magic Layers for the whole flyer', onSelect: handleExtract, disabled: !project.referencePreview || Boolean(extracting) || !design },
      ],
    },
    {
      label: 'Vector',
      items: [
        { label: 'Rectangle', shortcut: 'R', onSelect: () => addLayer('rect') },
        { label: 'Ellipse', shortcut: 'O', onSelect: () => addLayer('circle') },
        { label: 'Line', shortcut: 'L', onSelect: () => addLayer('line') },
        { label: 'Pen', shortcut: 'P', onSelect: choosePen, checked: penPoints !== null },
      ],
    },
    {
      label: 'Text',
      items: [
        { label: 'Add text', shortcut: 'T', onSelect: () => addLayer('text') },
        { label: 'Edit selected text', onSelect: () => selectedObject && editText(selectedObject.id), disabled: !selectedObject || !matchesFilter(selectedObject, 'text') },
        { label: 'Typography', onSelect: () => setPage('text') },
      ],
    },
    {
      label: 'Arrange',
      items: [
        ...(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(where => ({
          label: multi ? `Align ${where}` : `Align ${where} to frame`,
          onSelect: () => (multi ? alignMany(where) : alignSelected(where)),
          disabled: multi ? false : !movable,
        })),
        { separator: true as const },
        { label: 'Spread across', onSelect: () => distribute('x'), disabled: editableSelection.length < 3 },
        { label: 'Spread down', onSelect: () => distribute('y'), disabled: editableSelection.length < 3 },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom in', shortcut: 'Ctrl++', onSelect: () => zoomBy(1.25) },
        { label: 'Zoom out', shortcut: 'Ctrl+-', onSelect: () => zoomBy(0.8) },
        { label: 'Fit artboard', shortcut: 'Ctrl+0', onSelect: () => setZoom(1) },
        { label: playing != null ? 'Stop animation' : 'Play animation', shortcut: 'Ctrl+Enter', onSelect: () => (playing != null ? setPlaying(null) : play()) },
        { label: 'Actual pixels (100%)', shortcut: 'Ctrl+1', onSelect: zoomActual },
        { separator: true },
        { label: 'Layers panel', onSelect: () => setDock(current => ({ ...current, layers: !current.layers })), checked: dock.layers },
        { label: 'Navigator panel', onSelect: () => setDock(current => ({ ...current, navigator: !current.navigator })), checked: dock.navigator },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard shortcuts', shortcut: '?', onSelect: () => setShowShortcuts(true) },
        { label: 'Ask Spyda AI', onSelect: () => setPage('ai') },
      ],
    },
  ]

  const statusHint = penPoints
    ? <><b>Click</b> to add points. <b>Click the first point</b> to close. <b>Enter</b> finishes an open path, <b>Esc</b> cancels.</>
    : selectedObject
      ? selectedObject.protection.locked
        ? <>This layer is protected. <b>Esc</b> to deselect.</>
        : <><b>Drag</b> to move. <b>Drag a handle</b> to resize, <b>Shift</b> keeps proportions. <b>Arrows</b> nudge, <b>Shift+arrows</b> nudge further.{matchesFilter(selectedObject, 'text') ? <> <b>Double-click</b> to edit text.</> : null}</>
      : <><b>Click</b> a layer to select it. <b>Ctrl + scroll</b> to zoom. <b>V T R O L P I</b> pick tools, <b>?</b> shows every shortcut.</>

  const panelHeader = (label: string, open: boolean, onToggle: () => void, extra?: React.ReactNode) => (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#141518] px-2">
      <span className="h-3.5 w-1 rounded-full bg-white/10" aria-hidden />
      <span className="text-[11px] font-semibold">{label}</span>
      {extra}
      <button type="button" onClick={onToggle} aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`} aria-expanded={open} className="ml-auto flex h-5 w-5 items-center justify-center rounded border border-white/[0.1] text-muted-foreground hover:text-foreground">
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
    </div>
  )

  const historyList = steps.length ? (
    <ol className="space-y-0.5">
      <li>
        <button
          type="button"
          onClick={() => setHistory(current => (current ? jumpTo(current, 0) : current))}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors hover:bg-white/[0.05] ${cursor === 0 ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <Clock className="h-3 w-3" /> Original
        </button>
      </li>
      {steps.map((step, index) => {
        const Icon = stepIcon(step.intents)
        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => setHistory(current => (current ? jumpTo(current, index + 1) : current))}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors hover:bg-white/[0.05] ${
                index === cursor - 1 ? 'bg-primary/15 text-primary' : index < cursor ? 'text-foreground/90' : 'text-muted-foreground/50 line-through'
              }`}
            >
              <Icon className="h-3 w-3 shrink-0" /> <span className="truncate">{step.label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  ) : <p className="px-1 text-[11px] text-muted-foreground">Every edit lands here. Click one to go back to it.</p>

  const iconButton = 'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30'

  return (
    <main className="figma-editor flex min-h-[100dvh] flex-col bg-[#0b0c0e] text-foreground lg:h-[100dvh] lg:overflow-hidden">
      {/* Menu bar */}
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[#111214] px-1.5">
        <button
          type="button"
          onClick={exitCanvas}
          aria-label="Close canvas mode and go back to Spyda AI"
          title="Back to Spyda AI"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/[0.08]"
        >
          <img src="/assets/spyda-logo.png" alt="" className="h-5 w-5 object-contain" />
        </button>
        <div className="hidden lg:block"><EditorMenuBar menus={menus} /></div>
        <div className="min-w-0 flex-1 px-2 lg:hidden">
          <h1 className="truncate text-[12px] font-semibold">{project.name}</h1>
        </div>
        <div role="tablist" aria-label="Editor" className="mx-auto hidden shrink-0 items-center gap-0.5 rounded-lg bg-black/30 p-0.5 sm:flex">
          <button type="button" role="tab" aria-selected="true" className="inline-flex h-6 items-center gap-1.5 rounded-md bg-white/[0.1] px-2.5 text-[11px] font-semibold text-foreground">
            <Palette className="h-3 w-3 text-primary" aria-hidden /> Design
          </button>
          <button type="button" role="tab" aria-selected="false" onClick={() => { try { window.sessionStorage.setItem('spyda.lastCanvas', window.location.pathname) } catch { /* storage off */ } leaveTo('/video') }} title="Save this design and open the video editor" className="inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            <Clapperboard className="h-3 w-3" aria-hidden /> Video
          </button>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
          <button type="button" onClick={exitCanvas} title="Save and leave canvas mode" className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.1] px-2.5 text-[11px] font-semibold text-foreground/90 transition-colors hover:bg-white/[0.08]">
            <LogOut className="h-3 w-3" aria-hidden /> Done
          </button>
          <div className="flex h-7 overflow-hidden rounded-md bg-primary text-primary-foreground">
            <button type="button" onClick={() => handleExport(delivery)} disabled={exporting || !design} className="inline-flex items-center gap-1.5 pl-3 pr-2 text-[11px] font-semibold disabled:opacity-50">
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Download className="h-3 w-3" aria-hidden />}
              Export {delivery.format.toUpperCase()}
            </button>
            <button type="button" onClick={() => setPage('deliver')} aria-label="Export settings" title="Export settings" className="flex w-6 items-center justify-center border-l border-black/15 hover:bg-black/10">
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
      </header>

      {/* Context bar: studio pages, the selection, undo and zoom */}
      <div className="flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.06] bg-[#0f1012] px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div role="tablist" aria-label="Canvas pages" className="flex shrink-0 items-center gap-0.5 rounded-lg bg-black/30 p-0.5">
          {pages.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={page === item.id}
              onClick={() => setPage(item.id)}
              title={`${item.label} (Shift+${index + 1})`}
              className={`flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[11px] transition-colors ${
                page === item.id
                  ? item.id === 'ai' ? 'bg-primary font-semibold text-primary-foreground' : 'bg-white/[0.1] font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <item.icon className={`h-3.5 w-3.5 ${page === item.id && item.id !== 'ai' ? 'text-primary' : ''}`} />
              {item.label}
            </button>
          ))}
        </div>
        <span className="hidden h-5 w-px shrink-0 bg-white/10 md:block" />
        <p className="hidden min-w-0 shrink truncate text-[11px] md:block">
          {multi ? (
            <span className="font-semibold">{selectedObjects.length} layers selected{selectedObjects.every(object => object.relationships.groupId && object.relationships.groupId === selectedObjects[0].relationships.groupId) ? ' · Group' : ''}</span>
          ) : selectedObject ? (
            <>
              <span className="font-semibold">{selectedObject.name}</span>
              {selectedObject.transform.bounds && design?.canvas.width && design.canvas.height ? (
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  X {Math.round((selectedObject.transform.bounds.x / 100) * design.canvas.width)} · Y {Math.round((selectedObject.transform.bounds.y / 100) * design.canvas.height)} · {Math.round((selectedObject.transform.bounds.width / 100) * design.canvas.width)} × {Math.round((selectedObject.transform.bounds.height / 100) * design.canvas.height)}
                  {selectedObject.transform.rotation ? ` · ${Math.round(selectedObject.transform.rotation)}°` : ''}
                </span>
              ) : null}
            </>
          ) : <span className="text-muted-foreground">No selection</span>}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => setHistory(current => (current ? undo(current) : current))} disabled={!history || !canUndo(history)} title={(history && nextUndoLabel(history)) || 'Nothing to undo'} aria-label="Undo" className={iconButton}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" onClick={() => setHistory(current => (current ? redo(current) : current))} disabled={!history || !canRedo(history)} title={(history && nextRedoLabel(history)) || 'Nothing to redo'} aria-label="Redo" className={iconButton}>
            <Redo2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => (playing != null ? setPlaying(null) : play())}
            title={playing != null ? 'Stop (Ctrl+Enter)' : hasMotion(objects) ? 'Play the animation (Ctrl+Enter)' : 'Play (add animation on the Animate page)'}
            aria-label={playing != null ? 'Stop animation' : 'Play animation'}
            className={`ml-1 inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${playing != null ? 'bg-primary text-primary-foreground' : 'bg-white/[0.06] text-foreground/90 hover:bg-white/[0.12]'}`}
          >
            {playing != null ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {playing != null ? 'Stop' : 'Play'}
          </button>
          <span className="mx-1 h-5 w-px bg-white/10" />
          <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out" title="Zoom out (Ctrl -)" className={iconButton}><span className="text-[14px] leading-none">−</span></button>
          <button type="button" onClick={zoomActual} title="Actual pixels (Ctrl 1)" className="h-7 min-w-[46px] rounded-md bg-black/30 px-1.5 font-mono text-[10px] text-foreground/90 hover:bg-white/[0.08]">{zoomPercent}%</button>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (Ctrl +)" className={iconButton}><Plus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setZoom(1)} aria-label="Fit artboard" title="Fit artboard (Ctrl 0)" className={iconButton}><Maximize2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Tool column */}
        <nav aria-label="Tools" className="hidden w-11 shrink-0 flex-col items-center border-r border-white/[0.06] bg-[#111214] py-2 lg:flex">
          <CanvasToolbar
            orientation="vertical"
            onSelectTool={() => { setSelectedId(null); setPenPoints(null) }}
            onAdd={kind => addLayer(kind)}
            onPen={choosePen}
            penActive={penPoints !== null}
            onAssist={() => setPage('ai')}
            assistActive={page === 'ai'}
          />
        </nav>

        {/* Document */}
        <section className="flex min-h-[72vh] min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="flex h-7 shrink-0 items-end gap-1 border-b border-white/[0.06] bg-[#0d0e10] px-2">
            <div className="flex h-6 max-w-full items-center gap-2 rounded-t-md border border-b-0 border-white/[0.08] bg-[#16171a] pl-2.5 pr-1 text-[11px]">
              <span className="truncate text-foreground/90">{project.name}</span>
              <span className="shrink-0 text-muted-foreground">@ {zoomPercent}%{saved ? '' : '*'}</span>
              <button type="button" onClick={exitCanvas} aria-label="Save and close this document" title="Save and close" className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-white/[0.1] hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
            {missingFonts.size ? (
              <p className="mb-1 ml-auto max-w-[45%] truncate text-[10px] text-amber-200">{[...missingFonts].join(', ')} not loaded · showing Montserrat</p>
            ) : null}
          </div>

          <div className="editor-stage relative min-h-0 flex-1 overflow-hidden">
            {notice ? (
              <div
                role="status"
                className={[
                  'absolute inset-x-3 top-3 z-20 mx-auto flex max-w-xl items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] shadow-lg',
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
                selectedIds={selection}
                onSelect={selectLayer}
                onSelectMany={selectMany}
                onGeometryChangeMany={changes => applyStep(changes.flatMap(change => [
                  { objectId: change.objectId, property: 'bounds' as const, value: change.bounds, explicitGeometryChange: true },
                  { objectId: change.objectId, property: 'rotation' as const, value: change.rotation, explicitGeometryChange: true },
                ]), `Move ${changes.length} layers`)}
                onEditText={editText}
                penActive={penPoints !== null}
                penPoints={penPoints ?? []}
                onPenPoint={addPenPoint}
                onGeometryChange={(objectId, bounds, rotation, fontScale) => {
                  const object = design.objects.find(item => item.id === objectId)
                  const intents: DesignEditIntent[] = [
                    { objectId, property: 'bounds', value: bounds, explicitGeometryChange: true },
                    { objectId, property: 'rotation', value: rotation, explicitGeometryChange: true },
                  ]
                  // A text layer pulled from a corner grows or shrinks its type with the box.
                  if (fontScale && object && object.style.fontSize && object.protection.editableProperties.includes('fontSize')) {
                    intents.push({ objectId, property: 'fontSize', value: Math.round(object.style.fontSize * fontScale * 10) / 10 })
                    if (object.style.letterSpacing) intents.push({ objectId, property: 'letterSpacing', value: Math.round(object.style.letterSpacing * fontScale * 100) / 100 })
                  }
                  applyStep(intents, fontScale ? 'Resize text' : 'Move layer', fontScale ? undefined : `move:${objectId}`)
                }}
                playing={playing}
                onPlaybackEnd={stopPlaying}
                onTextChange={(objectId, text) => applyIntent({ objectId, property: 'text', value: text })}
                onContextMenu={(id, x, y) => setContextMenu({ id, x, y })}
                missingFonts={missingFonts}
                stageRef={stageRef}
                zoom={zoom}
                onZoomChange={setZoom}
                onDisplayScale={setDisplayScale}
                artboardLabel={`Artboard · ${size}`}
                scanning={magic}
                className="absolute inset-x-0 bottom-14 top-0 lg:bottom-0"
              />
            ) : project.referencePreview ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <img src={project.referencePreview} alt="Reference flyer" className="max-h-[60vh] w-auto rounded-lg border border-white/10" />
                <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
                  This flyer is still a flat picture. Open it from Spyda AI again so its parts become layers.
                </p>
              </div>
            ) : null}
            {extracting && !magic ? (
              <p className="absolute bottom-16 left-3 rounded-full bg-black/75 px-2.5 py-1 text-[10px] text-white backdrop-blur lg:bottom-3" role="status">
                {extracting.total ? `Cutting out layer ${extracting.done} of ${extracting.total}…` : 'Reading the flyer once to build its mask…'}
              </p>
            ) : null}
            {penPoints ? (
              <p className="absolute inset-x-0 bottom-14 z-10 mx-auto w-fit rounded-full bg-black/75 px-3 py-1 text-[10px] text-white backdrop-blur lg:hidden" role="status">
                Tap to add points · tap the first point to close
              </p>
            ) : null}
            {/* Phones keep the floating tool pill; desktop has the tool column. */}
            <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-2 lg:hidden">
              <CanvasToolbar
                onSelectTool={() => { setSelectedId(null); setPenPoints(null) }}
                onAdd={kind => addLayer(kind)}
                onPen={choosePen}
                penActive={penPoints !== null}
                onAssist={() => setPage('ai')}
                assistActive={page === 'ai'}
              />
            </div>
          </div>
        </section>

        {/* Dock: the studio page, layers, navigator and history */}
        <aside className="flex w-full shrink-0 flex-col border-t border-white/[0.06] bg-[#111214] lg:h-full lg:w-[288px] lg:border-l lg:border-t-0">
          <div className="flex min-h-[320px] flex-1 flex-col lg:min-h-0">
            {panelHeader(pageTitle || 'Design', true, () => setPage('design'), page === 'design' && selectedObject ? <span className="min-w-0 truncate text-[10px] text-muted-foreground">{selectedObject.name}</span> : null)}
            <div className={`min-h-0 flex-1 p-2.5 ${page === 'ai' ? 'flex flex-col' : 'overflow-y-auto'}`}>
              {panels[page]}
            </div>
          </div>

          <div className={`flex flex-col border-t border-white/[0.06] ${dock.layers ? 'lg:h-[30%] lg:min-h-[160px]' : ''}`}>
            {panelHeader(
              layerTab === 'layers' ? 'Layers' : 'Assets',
              dock.layers,
              () => setDock(current => ({ ...current, layers: !current.layers })),
              <span role="tablist" aria-label="Layers or assets" className="flex items-center gap-0.5">
                {missingAssets.length ? <span className="mr-1 text-[10px] text-amber-300">{missingAssets.length} loading</span> : null}
                {(['layers', 'assets'] as const).map(tab => (
                  <button key={tab} type="button" role="tab" aria-selected={layerTab === tab} onClick={() => { setLayerTab(tab); setDock(current => ({ ...current, layers: true })) }} className={`h-5 rounded px-1.5 text-[10px] capitalize ${layerTab === tab ? 'bg-white/[0.1] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {tab}{tab === 'layers' ? ` ${live.length}` : ''}
                  </button>
                ))}
              </span>,
            )}
            {dock.layers ? (
              <div className="flex min-h-0 flex-1 flex-col px-1.5 pb-1.5 pt-1">
                {layerTab === 'layers' ? (
                  <>
                    <input
                      type="search"
                      value={layerQuery}
                      onChange={event => setLayerQuery(event.target.value)}
                      onKeyDown={event => event.stopPropagation()}
                      placeholder="Find a layer…"
                      aria-label="Find a layer"
                      className="mx-0.5 mb-1 h-6 rounded-md bg-white/[0.05] px-2 text-[11px] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/60"
                    />
                    <div className="mb-1 flex flex-wrap gap-1 px-0.5">
                      {FILTERS.map(item => {
                        const count = live.filter(object => matchesFilter(object, item.id)).length
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setFilter(item.id)}
                            aria-pressed={filter === item.id}
                            className={`h-5 rounded px-1.5 text-[9px] font-medium transition-colors ${filter === item.id ? 'bg-white/[0.12] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                          >
                            {item.label} <span className="opacity-60">{count}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="editor-dense max-h-[40vh] min-h-0 flex-1 overflow-y-auto lg:max-h-none">
                      <LayerList
                        objects={filtered}
                        selectedId={selectedId}
                        selectedIds={selection}
                        onSelect={selectLayer}
                        onReorder={handleReorder}
                        onToggleVisibility={handleToggleVisibility}
                        onDuplicate={handleDuplicate}
                        onRemove={objectId => applyIntent({ objectId, property: 'removed', value: true })}
                        thumbnail={object => (object.content.assetRef ? images[object.content.assetRef]?.src : undefined)}
                        query={layerQuery}
                      />
                    </div>
                  </>
                ) : (
                  <div className="max-h-[40vh] min-h-0 flex-1 overflow-y-auto lg:max-h-none">
                    <AssetsPanel objects={objects} images={images} selectedIds={selection} onSelect={selectMany} onAddPicture={() => imageInputRef.current?.click()} />
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className={`flex flex-col border-t border-white/[0.06] ${dock.navigator ? 'lg:h-[24%] lg:min-h-[150px]' : ''}`}>
            {panelHeader(
              lowerTab === 'navigator' ? 'Navigator' : 'History',
              dock.navigator,
              () => setDock(current => ({ ...current, navigator: !current.navigator })),
              <span role="tablist" aria-label="Navigator or history" className="flex gap-0.5">
                {(['navigator', 'history'] as const).map(tab => (
                  <button key={tab} type="button" role="tab" aria-selected={lowerTab === tab} onClick={() => { setLowerTab(tab); setDock(current => ({ ...current, navigator: true })) }} className={`h-5 rounded px-1.5 text-[10px] capitalize ${lowerTab === tab ? 'bg-white/[0.1] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {tab}
                  </button>
                ))}
              </span>,
            )}
            {dock.navigator ? (
              lowerTab === 'navigator' ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out" className="flex h-5 w-5 items-center justify-center rounded border border-white/[0.1] text-muted-foreground hover:text-foreground">−</button>
                    <input
                      type="range"
                      min={-2}
                      max={3}
                      step={0.01}
                      value={Math.log2(zoom)}
                      onChange={event => setZoom(2 ** Number(event.target.value))}
                      aria-label="Zoom"
                      className="h-1 min-w-0 flex-1 cursor-pointer accent-[#9dfab0]"
                    />
                    <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" className="flex h-5 w-5 items-center justify-center rounded border border-white/[0.1] text-muted-foreground hover:text-foreground">+</button>
                    <span className="w-11 rounded bg-black/30 px-1 py-0.5 text-right font-mono text-[10px]">{zoomPercent}%</span>
                  </div>
                  <button type="button" onClick={() => setZoom(1)} title="Fit artboard" className="flex min-h-0 flex-1 items-center justify-center rounded-md bg-black/30 p-2">
                    {thumbnail
                      ? <img src={thumbnail} alt="Whole design" className={`max-h-full max-w-full object-contain ${zoom > 1.01 ? 'outline outline-1 outline-primary' : ''}`} />
                      : <span className="text-[10px] text-muted-foreground">Preview appears after the first render</span>}
                  </button>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5">{historyList}</div>
              )
            ) : null}
          </div>
        </aside>
      </div>

      {/* Status bar */}
      <footer className="hidden h-6 shrink-0 items-center gap-3 border-t border-white/[0.06] bg-[#111214] px-3 text-[10px] text-muted-foreground sm:flex">
        <span className="shrink-0">Artboard 1 of 1</span>
        <span className="shrink-0">{live.length} layers</span>
        <span className="h-3 w-px shrink-0 bg-white/10" />
        <span className="min-w-0 flex-1 truncate [&_b]:font-semibold [&_b]:text-foreground/90">{statusHint}</span>
        <span className="shrink-0 font-mono">{size}</span>
        <span className={`shrink-0 ${saved ? 'text-primary' : ''}`}>{saved ? 'Saved' : 'Not saved yet'}</span>
      </footer>

      {contextMenu ? (() => {
        const target = objects.find(object => object.id === contextMenu.id)
        if (!target) return null
        const picture = ['image', 'logo', 'icon'].includes(target.kind)
        const items: Array<[string, string, () => void, boolean?] | null> = [
          ['Copy', 'Ctrl+C', () => { copySelected() }],
          ['Paste', 'Ctrl+V', pasteClipboard, !clipboard.current],
          ['Duplicate', 'Ctrl+D', duplicateSelection],
          ['Delete', 'Del', deleteSelection],
          ...(multi || target.relationships.groupId ? [null, ['Group', 'Ctrl+G', groupSelection, editableSelection.length < 2], ['Ungroup', 'Ctrl+Shift+G', ungroupSelection, !editableSelection.some(object => object.relationships.groupId)]] as Array<[string, string, () => void, boolean?] | null> : []),
          null,
          ['Bring to front', 'Ctrl+Shift+]', () => moveToEdge(target.id, 'front')],
          ['Bring forward', 'Ctrl+]', () => handleReorder(target.id, 'up')],
          ['Send backward', 'Ctrl+[', () => handleReorder(target.id, 'down')],
          ['Send to back', 'Ctrl+Shift+[', () => moveToEdge(target.id, 'back')],
          null,
          ['Copy style', 'Ctrl+Shift+C', copyStyle],
          ['Paste style', 'Ctrl+Shift+V', pasteStyle, !styleClipboard.current],
          ['Flip horizontal', '', () => applyIntent({ objectId: target.id, property: 'flipX', value: !target.transform.flipX })],
          ['Animate…', '', () => setPage('animate')],
          ...(picture ? [null, ['Remove background', '', () => handleRemoveBackground(target)], ['Magic layers', '', () => handleMagicLayers(target)]] as Array<[string, string, () => void] | null> : []),
        ]
        return (
          <div className="fixed inset-0 z-[70]" onPointerDown={() => setContextMenu(null)} onContextMenu={event => { event.preventDefault(); setContextMenu(null) }}>
            <div
              role="menu"
              aria-label={`${target.name} actions`}
              onPointerDown={event => event.stopPropagation()}
              className="absolute min-w-[210px] rounded-lg border border-white/[0.1] bg-[#1b1c1f] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
              style={{ left: Math.min(contextMenu.x, window.innerWidth - 230), top: Math.min(contextMenu.y, window.innerHeight - 420) }}
            >
              {items.map((item, index) => item ? (
                <button
                  key={item[0]}
                  type="button"
                  role="menuitem"
                  disabled={item[3]}
                  onClick={() => { setContextMenu(null); item[2]() }}
                  className="flex h-7 w-full items-center justify-between gap-4 rounded-md px-2 text-left text-[12px] text-foreground/90 hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <span>{item[0]}</span>
                  <span className="font-mono text-[10px] opacity-60">{item[1]}</span>
                </button>
              ) : <div key={`sep-${index}`} role="separator" className="my-1 h-px bg-white/[0.07]" />)}
            </div>
          </div>
        )
      })() : null}

      {showShortcuts ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={() => setShowShortcuts(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#16171a] p-4 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">Keyboard shortcuts</h2>
              <button type="button" onClick={() => setShowShortcuts(false)} aria-label="Close" className={iconButton}><X className="h-3.5 w-3.5" /></button>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[11px]">
              {[
                ['Select', 'V'], ['Text', 'T'], ['Rectangle', 'R'], ['Ellipse', 'O'], ['Line', 'L'], ['Pen', 'P'], ['Place image', 'I'],
                ['Undo / redo', 'Ctrl+Z / Ctrl+Shift+Z'], ['Duplicate', 'Ctrl+D'], ['Delete', 'Del'], ['Nudge', 'Arrows (Shift: further)'],
                ['Select several', 'Shift-click, or drag a box'], ['Select all', 'Ctrl+A'], ['Group / ungroup', 'Ctrl+G / Ctrl+Shift+G'], ['Pick inside a group', 'Alt-click'],
                ['Cut / copy / paste', 'Ctrl+X / C / V'], ['Copy / paste style', 'Ctrl+Shift+C / V'], ['Forward / backward', 'Ctrl+] / Ctrl+['], ['Play animation', 'Ctrl+Enter'],
                ['Edit text on the canvas', 'Double-click'], ['Snap to guides', 'Drag (magenta lines)'],
                ['Zoom in / out', 'Ctrl+ / Ctrl−, Ctrl + scroll'], ['Fit / 100%', 'Ctrl+0 / Ctrl+1'], ['Studio pages', 'Shift+1 … Shift+7'], ['Deselect', 'Esc'],
              ].map(([label, keys]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-mono text-[10px] text-foreground/90">{keys}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </main>
  )
}
