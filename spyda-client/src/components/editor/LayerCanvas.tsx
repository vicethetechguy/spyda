import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import Konva from 'konva'
import { compositeOf, gradientProps, motionAt, needsFilters, playLength, shadowProps } from '../../lib/canvas-fx'
import type { DesignDocument, DesignObject, PercentBox } from '../../core/design-document'
import { resolveFamily } from '../../lib/fonts'
import { duotoneFilter, recolorFilter } from '../../lib/image-colors'
import { TextAlignControls, type HorizontalAlign, type VerticalAlign } from './TextAlignControls'
import { fitFontSize } from '../../lib/text-fit'

/**
 * The editable canvas.
 *
 * Percent bounds are the document's coordinate space; everything here converts to
 * display pixels and back, so a layer keeps its meaning whatever the viewport.
 *
 * One Konva `Layer` per object would be the literal reading of the plan, but each
 * Konva Layer is its own canvas plus its own hit graph, so a ten-layer flyer would
 * pay ten canvases for no gain. Compositing order is what matters, and that comes
 * from sorting children inside a single content Layer. The Transformer lives in a
 * separate overlay Layer so its handles are never clipped by a layer's own bounds.
 */

const MIN_DISPLAY_SIZE = 160

export type LayerCanvasProps = {
  document: DesignDocument
  /** Resolved pixels per `content.assetRef`; missing entries render as empty. */
  images: Record<string, HTMLImageElement>
  /**
   * The flat flyer, shown until the layers have pixels of their own. Without it a
   * freshly opened project is a set of dashed boxes, which reads as broken rather
   * than as "press Make it editable".
   */
  fallbackImage?: HTMLImageElement | null
  selectedId: string | null
  /** Every selected layer (the primary one last). */
  selectedIds?: string[]
  /**
   * `toggle` adds or removes (Shift-click); `exact` picks one layer inside a
   * group (Alt-click) instead of the whole group.
   */
  onSelect: (objectId: string | null, mode?: 'replace' | 'toggle', exact?: boolean) => void
  /** A selection box: every layer it touches (added to the selection with Shift). */
  onSelectMany?: (objectIds: string[], additive: boolean) => void
  /** Several layers moved, resized or rotated together: one undo step. */
  onGeometryChangeMany?: (changes: Array<{ objectId: string; bounds: PercentBox; rotation: number }>) => void
  /** `fontScale`: a text layer resized from a corner scales its type with it. */
  onGeometryChange: (objectId: string, bounds: PercentBox, rotation: number, fontScale?: number) => void
  missingFonts: ReadonlySet<string>
  className?: string
  /** Filled with the Konva stage, for exporting the design as an image. */
  stageRef?: React.MutableRefObject<Konva.Stage | null>
  /** Double-click on a layer: the editor focuses its text, like Figma. */
  onEditText?: (objectId: string) => void
  /** Pen tool: while active, clicks add points instead of selecting layers. */
  penActive?: boolean
  /** The path being drawn, in canvas percent. */
  penPoints?: [number, number][]
  onPenPoint?: (point: [number, number]) => void
  /** View zoom: 1 fits the artboard to the viewport; above 1 the viewport scrolls. */
  zoom?: number
  /** Ctrl/Cmd + wheel or a pinch asks for a new zoom. */
  onZoomChange?: (zoom: number) => void
  /** Reports display pixels per document pixel, for the "@ 90%" readouts. */
  onDisplayScale?: (scale: number) => void
  /** The name shown above the artboard, like a design app's artboard title. */
  artboardLabel?: string
  /** Magic Layers at work: a scanning shimmer over this part of the canvas. */
  scanning?: { frame: PercentBox; label: string; progress: number } | null
  /** Playback start (performance.now()), or null when the design is still. */
  playing?: number | null
  onPlaybackEnd?: () => void
  /** Typing in a text layer on the canvas. */
  onTextChange?: (objectId: string, text: string) => void
  /** Alignment from the floating text toolbar on the canvas. */
  onTextAlign?: (objectId: string, patch: { textAlign?: HorizontalAlign; verticalAlign?: VerticalAlign }) => void
  /** Right-click on a layer, at screen coordinates. */
  onContextMenu?: (objectId: string, x: number, y: number) => void
}

/** Room around the artboard: the padding on each side and the label above it. */
const FRAME_PADDING = 28
const LABEL_HEIGHT = 18

function parseAspectRatio(value: string) {
  const match = /^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/.exec(value || '')
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return null
  return width / height
}

function documentAspect(document: DesignDocument, backgroundImage: HTMLImageElement | undefined) {
  if (document.canvas.width && document.canvas.height) return document.canvas.width / document.canvas.height
  const declared = parseAspectRatio(document.canvas.aspectRatio)
  if (declared) return declared
  if (backgroundImage?.naturalWidth && backgroundImage.naturalHeight) {
    return backgroundImage.naturalWidth / backgroundImage.naturalHeight
  }
  return 1
}

let measuringContext: CanvasRenderingContext2D | null | undefined

function measureContext() {
  if (measuringContext === undefined) {
    measuringContext = typeof document !== 'undefined'
      ? document.createElement('canvas').getContext('2d')
      : null
  }
  return measuringContext
}

/**
 * Font size in display pixels. A declared size is the person's choice and is
 * honoured; a missing one is fitted so the whole text shows inside its box.
 */
function resolvedFontSize(
  object: DesignObject,
  box: { width: number; height: number },
  scale: number,
  fontFamily: string,
  bold: boolean,
) {
  const declared = object.style.fontSize
  if (declared && declared > 0) return declared * scale

  const text = object.content.text || ''
  const context = measureContext()
  // Without a canvas to measure on, a size from the height still renders something.
  if (!context || !text.trim()) return Math.max(8, box.height * 0.62)

  const letterSpacing = object.style.letterSpacing ?? 0
  return fitFontSize({
    text,
    width: box.width,
    height: box.height,
    lineHeight: object.style.lineHeight || 1.2,
    maxSize: Math.max(8, box.height * 0.9),
    measure: (value, size) => {
      context.font = `${bold ? 'bold ' : ''}${size}px ${fontFamily}`
      return context.measureText(value).width + letterSpacing * value.length
    },
  })
}

/** The text as shown: letter case is a display setting, the words stay as typed. */
function shownText(object: DesignObject) {
  const text = object.content.text || ''
  switch (object.style.typography?.case) {
    case 'upper': return text.toUpperCase()
    case 'lower': return text.toLowerCase()
    case 'title': return text.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase())
    default: return text
  }
}

/**
 * Typewriter playback: shows the first `fraction` of the text, across every
 * paragraph block when paragraph spacing splits it into several.
 */
function revealText(group: Konva.Group, object: DesignObject, fraction: number) {
  const nodes = group.find('Text') as Konva.Text[]
  if (!nodes.length) return
  const shown = shownText(object)
  const parts = nodes.length > 1 ? shown.split('\n') : [shown]
  let budget = Math.round(shown.replace(/\n/g, '').length * fraction)
  nodes.forEach((node, index) => {
    const part = parts[index] ?? ''
    node.text(part.slice(0, Math.max(0, budget)))
    budget -= part.replace(/\n/g, '').length
  })
}

/** Konva's fontStyle: italic and the weight together ("italic 700"). */
function konvaFontStyle(object: DesignObject, bold: boolean) {
  const weight = /^\d{3}$/.test(object.style.fontWeight || '') ? object.style.fontWeight! : bold ? 'bold' : 'normal'
  return object.style.typography?.italic ? `italic ${weight}` : weight
}

function textDecoration(object: DesignObject) {
  const typography = object.style.typography
  return [typography?.underline ? 'underline' : '', typography?.strike ? 'line-through' : ''].filter(Boolean).join(' ')
}

/**
 * Konva draws pictures with the canvas's default (low) smoothing, which turns a
 * 4K picture shown at a few hundred pixels soft and jagged. Asking for high
 * quality resampling keeps its text and edges crisp on screen and in exports.
 */
function smoothImage(context: Konva.Context, shape: Konva.Shape) {
  const native = (context as unknown as { _context: CanvasRenderingContext2D })._context
  native.imageSmoothingEnabled = true
  native.imageSmoothingQuality = 'high'
  ;(shape as unknown as { _sceneFunc: (context: Konva.Context) => void })._sceneFunc(context)
}

/**
 * The layer's drawing, with pixel filters (blur, brightness, contrast,
 * saturation, black and white) when it has any. Filters need a cached bitmap,
 * so it is re-cached whenever what it draws changes.
 */
function FilteredGroup({ object, pixelScale: scale, children, ...rest }: { object: DesignObject; pixelScale: number; children: React.ReactNode } & Konva.ContainerConfig) {
  const ref = useRef<Konva.Group | null>(null)
  const fx = object.style.fx
  const active = needsFilters(fx)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!active) { node.clearCache(); node.filters([]); node.getLayer()?.batchDraw(); return }
    const filters: Array<typeof Konva.Filters.Blur> = []
    if ((fx?.blur ?? 0) > 0) filters.push(Konva.Filters.Blur)
    if (fx?.brightness) filters.push(Konva.Filters.Brighten)
    if (fx?.contrast) filters.push(Konva.Filters.Contrast)
    if (fx?.saturation) filters.push(Konva.Filters.HSL)
    if (fx?.grayscale) filters.push(Konva.Filters.Grayscale)
    // Picture colours: swaps first, then duotone over the result.
    if (fx?.recolor?.length) filters.push(recolorFilter as unknown as typeof Konva.Filters.Blur)
    if (fx?.duotone && fx.duotone.amount > 0) filters.push(duotoneFilter as unknown as typeof Konva.Filters.Blur)
    node.setAttr('spydaRecolor', fx?.recolor ?? [])
    node.setAttr('spydaRecolorRange', fx?.recolorRange ?? 60)
    node.setAttr('spydaDuotone', fx?.duotone ?? null)
    node.filters(filters)
    node.blurRadius(Math.round((fx?.blur ?? 0) * scale))
    node.brightness(fx?.brightness ?? 0)
    node.contrast(fx?.contrast ?? 0)
    node.saturation(fx?.saturation ?? 0)
    // Room around the drawing so a blur or a shadow is not clipped by the cache.
    const pad = Math.ceil((fx?.blur ?? 0) * scale * 2 + (fx?.shadow ? (fx.shadow.blur + Math.abs(fx.shadow.x) + Math.abs(fx.shadow.y)) * scale : 0)) + 4
    // Recoloured pictures cache at a higher resolution so exports stay sharp.
    const colourWork = Boolean(fx?.recolor?.length || fx?.duotone)
    try { node.cache({ offset: pad, pixelRatio: colourWork ? Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 1.5)) : Math.min(2, window.devicePixelRatio || 1) }) } catch { /* an empty group has nothing to cache */ }
    node.getLayer()?.batchDraw()
  })
  return <Group ref={ref} {...rest}>{children}</Group>
}

function usesTextMetrics(object: DesignObject) {
  return object.kind === 'text' || object.kind === 'action'
}

function isVisible(object: DesignObject) {
  return !object.status.removed && object.status.visible
}

function drawOrder(document: DesignDocument) {
  return [...document.objects]
    .filter(isVisible)
    .sort((left, right) => {
      if (left.kind === 'background' && right.kind !== 'background') return -1
      if (right.kind === 'background' && left.kind !== 'background') return 1
      return left.zIndex - right.zIndex
    })
}

function isLocked(object: DesignObject) {
  return object.protection.locked
}

export default function LayerCanvas({
  document,
  images,
  fallbackImage,
  selectedId,
  selectedIds: selectedIdsProp,
  onSelect,
  onSelectMany,
  onGeometryChangeMany,
  onGeometryChange,
  missingFonts,
  className,
  stageRef,
  onEditText,
  penActive = false,
  penPoints = [],
  onPenPoint,
  zoom = 1,
  onZoomChange,
  onDisplayScale,
  artboardLabel,
  scanning = null,
  playing = null,
  onPlaybackEnd,
  onTextChange,
  onTextAlign,
  onContextMenu,
}: LayerCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const nodeRefs = useRef(new Map<string, Konva.Group>())
  const motionRefs = useRef(new Map<string, Konva.Group>())
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] })
  const anchorRef = useRef<string | null>(null)
  const selectedIds = useMemo(() => selectedIdsProp ?? (selectedId ? [selectedId] : []), [selectedId, selectedIdsProp])
  const many = selectedIds.length > 1
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; additive: boolean } | null>(null)
  const lastGroupCommit = useRef(0)

  const backgroundImage = useMemo(() => {
    const background = document.objects.find(object => object.kind === 'background' && isVisible(object))
    return background?.content.assetRef ? images[background.content.assetRef] : undefined
  }, [document.objects, images])

  const aspect = documentAspect(document, backgroundImage ?? fallbackImage ?? undefined)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return

    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight })
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Fit the document inside the viewport without ever letterboxing unevenly.
  const display = useMemo(() => {
    // A container that has not been given a height yet still has a width, and
    // falling back to the ratio keeps the Stage mounted instead of leaving an
    // empty panel that never recovers.
    const roomX = Math.max(0, viewport.width - FRAME_PADDING * 2)
    const roomY = Math.max(0, viewport.height - FRAME_PADDING * 2 - (artboardLabel ? LABEL_HEIGHT : 0))
    const available = roomY || (roomX ? roomX / aspect : 0)
    if (!roomX || !available) return { width: 0, height: 0, scale: 1 }
    const byWidth = { width: roomX, height: roomX / aspect }
    const fitted = byWidth.height <= available
      ? byWidth
      : { width: available * aspect, height: available }
    const width = Math.max(MIN_DISPLAY_SIZE, Math.floor(fitted.width * zoom))
    const height = Math.max(MIN_DISPLAY_SIZE, Math.floor(fitted.height * zoom))
    const baseWidth = document.canvas.width || backgroundImage?.naturalWidth || width
    return { width, height, scale: width / baseWidth }
  }, [artboardLabel, aspect, backgroundImage, document.canvas.width, viewport.height, viewport.width, zoom])

  useEffect(() => {
    if (display.width) onDisplayScale?.(display.scale)
  }, [display.scale, display.width, onDisplayScale])

  // Zooming keeps the point at the middle of the view where it was, instead of jumping to a corner.
  const centre = useRef({ x: 0.5, y: 0.5 })
  const rememberCentre = useCallback(() => {
    const element = containerRef.current
    if (!element || !element.scrollWidth || !element.scrollHeight) return
    centre.current = {
      x: (element.scrollLeft + element.clientWidth / 2) / element.scrollWidth,
      y: (element.scrollTop + element.clientHeight / 2) / element.scrollHeight,
    }
  }, [])
  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    element.scrollLeft = centre.current.x * element.scrollWidth - element.clientWidth / 2
    element.scrollTop = centre.current.y * element.scrollHeight - element.clientHeight / 2
  }, [display.width, display.height])

  // Ctrl/Cmd + wheel (and trackpad pinch, which arrives as ctrl + wheel) zooms the view.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const element = containerRef.current
    if (!element || !onZoomChange) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0025)
      onZoomChange(Math.min(8, Math.max(0.25, zoomRef.current * factor)))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [onZoomChange, display.width])

  const toPercent = useCallback((pixels: number, total: number) => {
    if (!total) return 0
    return Math.min(100, Math.max(0, (pixels / total) * 100))
  }, [])

  const selectedObject = selectedId
    ? document.objects.find(object => object.id === selectedId && isVisible(object)) ?? null
    : null

  /**
   * Reattaching on every render keeps the handles on the right node, and removing
   * them entirely for a locked layer is the point: a protected layer must not
   * look like something you can drag.
   */
  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const nodes = selectedIds
      .map(id => document.objects.find(object => object.id === id && isVisible(object)))
      .filter((object): object is DesignObject => Boolean(object) && !isLocked(object!) && object!.kind !== 'background')
      .map(object => nodeRefs.current.get(object.id))
      .filter((node): node is Konva.Group => Boolean(node))
    transformer.nodes(nodes)
    transformer.getLayer()?.batchDraw()
  }, [selectedIds, document.objects, display.width])

  const commitGeometry = useCallback((object: DesignObject, node: Konva.Group) => {
    const bounds = object.transform.bounds
    if (!bounds) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)

    const widthPx = Math.max(1, node.width() * scaleX)
    const heightPx = Math.max(1, node.height() * scaleY)
    const rotation = node.rotation()

    // A corner drag on text scales the type (like Canva); a side drag reflows it.
    const corner = /^(top|bottom)-(left|right)$/.test(anchorRef.current ?? '')
    const fontScale = usesTextMetrics(object) && corner && Math.abs(scaleX - scaleY) < 0.02 && Math.abs(scaleY - 1) > 0.005 ? scaleY : undefined
    anchorRef.current = null
    onGeometryChange(object.id, {
      x: toPercent(node.x(), display.width),
      y: toPercent(node.y(), display.height),
      width: Math.min(100, toPercent(widthPx, display.width)),
      height: Math.min(100, toPercent(heightPx, display.height)),
    }, rotation, fontScale)

    // Snap the node back to the document before React re-renders. If the intent is
    // rejected by a constraint the props never change, and the node would
    // otherwise keep the position the pointer left it in.
    node.position({ x: (bounds.x / 100) * display.width, y: (bounds.y / 100) * display.height })
    node.width((bounds.width / 100) * display.width)
    node.height((bounds.height / 100) * display.height)
    node.rotation(object.transform.rotation)
  }, [display.height, display.width, onGeometryChange, toPercent])

  /** Several layers changed together (a group drag or a multi-layer transform). */
  const commitMany = useCallback(() => {
    // Konva reports the end of a group drag once per layer; record it once.
    const now = performance.now()
    if (now - lastGroupCommit.current < 120) return
    lastGroupCommit.current = now
    const changes: Array<{ objectId: string; bounds: PercentBox; rotation: number }> = []
    for (const id of selectedIds) {
      const object = document.objects.find(item => item.id === id)
      const node = nodeRefs.current.get(id)
      const bounds = object?.transform.bounds
      if (!object || !node || !bounds || isLocked(object) || object.kind === 'background') continue
      const scaleX = node.scaleX(), scaleY = node.scaleY()
      node.scaleX(1); node.scaleY(1)
      changes.push({
        objectId: id,
        bounds: {
          x: toPercent(node.x(), display.width),
          y: toPercent(node.y(), display.height),
          width: Math.min(100, toPercent(Math.max(1, node.width() * scaleX), display.width)),
          height: Math.min(100, toPercent(Math.max(1, node.height() * scaleY), display.height)),
        },
        rotation: node.rotation(),
      })
      node.position({ x: (bounds.x / 100) * display.width, y: (bounds.y / 100) * display.height })
      node.width((bounds.width / 100) * display.width)
      node.height((bounds.height / 100) * display.height)
      node.rotation(object.transform.rotation)
    }
    if (changes.length) onGeometryChangeMany?.(changes)
  }, [display.height, display.width, document.objects, onGeometryChangeMany, selectedIds, toPercent])

  const clampWithinCanvas = useCallback((object: DesignObject) => {
    const bounds = object.transform.bounds
    return (position: { x: number; y: number }) => {
      if (!object.constraints.stayInsideCanvas || !bounds) return position
      const widthPx = (bounds.width / 100) * display.width
      const heightPx = (bounds.height / 100) * display.height
      return {
        x: Math.min(Math.max(0, position.x), Math.max(0, display.width - widthPx)),
        y: Math.min(Math.max(0, position.y), Math.max(0, display.height - heightPx)),
      }
    }
  }, [display.height, display.width])

  /**
   * Smart guides: while a layer is dragged, its edges and centre snap to the
   * canvas's edges and centre and to every other layer's, with a guide line
   * drawn where they meet.
   */
  const snapOnDrag = useCallback((object: DesignObject, node: Konva.Group) => {
    const threshold = 6
    const w = node.width(), h = node.height()
    const xs = [0, display.width / 2, display.width]
    const ys = [0, display.height / 2, display.height]
    for (const other of document.objects) {
      const b = other.transform.bounds
      if (other.id === object.id || !b || !isVisible(other) || other.kind === 'background') continue
      const ox = (b.x / 100) * display.width, oy = (b.y / 100) * display.height
      const ow = (b.width / 100) * display.width, oh = (b.height / 100) * display.height
      xs.push(ox, ox + ow / 2, ox + ow)
      ys.push(oy, oy + oh / 2, oy + oh)
    }
    const best = (edges: number[], targets: number[]) => {
      let found: { delta: number; at: number } | null = null
      for (const edge of edges) for (const target of targets) {
        const delta = target - edge
        if (Math.abs(delta) <= threshold && (!found || Math.abs(delta) < Math.abs(found.delta))) found = { delta, at: target }
      }
      return found
    }
    const x = node.x(), y = node.y()
    const snapX = node.rotation() ? null : best([x, x + w / 2, x + w], xs)
    const snapY = node.rotation() ? null : best([y, y + h / 2, y + h], ys)
    if (snapX) node.x(x + snapX.delta)
    if (snapY) node.y(y + snapY.delta)
    setGuides({ v: snapX ? [snapX.at] : [], h: snapY ? [snapY.at] : [] })
  }, [display.height, display.width, document.objects])

  // Playback: every layer's motion group follows its entrance and loop.
  useEffect(() => {
    if (playing == null) {
      for (const [id, group] of motionRefs.current) {
        group.setAttrs({ x: group.offsetX(), y: group.offsetY(), scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 })
        const object = document.objects.find(item => item.id === id)
        if (object?.style.fx?.enter?.type === 'typewriter') revealText(group, object, 1)
      }
      motionRefs.current.values().next().value?.getLayer()?.batchDraw()
      return
    }
    const length = playLength(document.objects)
    const travel = Math.max(24, display.height * 0.08)
    let frame = 0
    const tick = () => {
      const t = (performance.now() - playing) / 1000
      for (const object of document.objects) {
        const group = motionRefs.current.get(object.id)
        if (!group) continue
        const m = motionAt(object.style.fx, t, travel)
        group.setAttrs({ x: group.offsetX() + m.dx, y: group.offsetY() + m.dy, scaleX: m.scaleX, scaleY: m.scaleY, rotation: m.rotation, opacity: m.opacity })
        if (object.style.fx?.enter?.type === 'typewriter') revealText(group, object, m.reveal)
      }
      motionRefs.current.values().next().value?.getLayer()?.batchDraw()
      if (t >= length) { onPlaybackEnd?.(); return }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [display.height, document.objects, onPlaybackEnd, playing])

  // A selection box released outside the canvas is cancelled, never left hanging.
  useEffect(() => {
    if (!marquee) return
    const up = (event: MouseEvent) => { if ((event.target as HTMLElement | null)?.tagName !== 'CANVAS') setMarquee(null) }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [marquee])

  // Leaving the layer being typed into ends the editing.
  useEffect(() => {
    if (editingId && editingId !== selectedId) setEditingId(null)
  }, [editingId, selectedId])

  if (!display.width || !display.height) {
    return <div ref={containerRef} className={className} aria-busy="true" />
  }

  const editingObject = editingId ? document.objects.find(object => object.id === editingId) ?? null : null
  const hoveredObject = hoveredId && !selectedIds.includes(hoveredId) ? document.objects.find(object => object.id === hoveredId && isVisible(object)) ?? null : null

  return (
    <div
      ref={containerRef}
      onScroll={rememberCentre}
      onPointerDown={event => {
        // The grey workspace around the artboard (anything that is not the canvas
        // itself or the text being typed) clears the selection, like any design app.
        const target = event.target as HTMLElement
        if (target.tagName !== 'CANVAS' && target.tagName !== 'TEXTAREA') { setEditingId(null); onSelect(null) }
      }}
      onContextMenu={event => event.preventDefault()}
      className={`overflow-auto [scrollbar-gutter:stable] ${className ?? ''}`}
    >
      {/* w-max + m-auto: centred while it fits, scrollable from every edge once zoomed past the viewport. */}
      <div className="flex h-max min-h-full w-max min-w-full" style={{ padding: FRAME_PADDING }}>
      <div className="m-auto">
      {artboardLabel ? (
        <p className="truncate text-[10px] font-medium text-muted-foreground" style={{ height: LABEL_HEIGHT, maxWidth: display.width }}>{artboardLabel}</p>
      ) : null}
      <div className="relative shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_24px_70px_rgba(0,0,0,0.55)]" style={{ width: display.width, height: display.height }}>
      <Stage
        ref={node => { if (stageRef) stageRef.current = node }}
        width={display.width}
        height={display.height}
        onMouseDown={event => {
          const stage = event.target.getStage()
          if (penActive && stage) {
            const pointer = stage.getPointerPosition()
            if (pointer) onPenPoint?.([toPercent(pointer.x, display.width), toPercent(pointer.y, display.height)])
            return
          }
          if (event.target === stage && stage) {
            setEditingId(null)
            const pointer = stage.getPointerPosition()
            // A press on empty canvas starts a selection box; a plain click (no drag) still deselects.
            if (pointer && event.evt.button === 0) setMarquee({ x0: pointer.x, y0: pointer.y, x1: pointer.x, y1: pointer.y, additive: event.evt.shiftKey })
            else onSelect(null)
          }
        }}
        onMouseMove={event => {
          if (!marquee) return
          const pointer = event.target.getStage()?.getPointerPosition()
          if (pointer) setMarquee(current => (current ? { ...current, x1: pointer.x, y1: pointer.y } : current))
        }}
        onMouseUp={() => {
          if (!marquee) return
          const box = { x0: Math.min(marquee.x0, marquee.x1), y0: Math.min(marquee.y0, marquee.y1), x1: Math.max(marquee.x0, marquee.x1), y1: Math.max(marquee.y0, marquee.y1) }
          setMarquee(null)
          if (box.x1 - box.x0 < 4 && box.y1 - box.y0 < 4) { if (!marquee.additive) onSelect(null); return }
          const hit = document.objects.filter(object => {
            const b = object.transform.bounds
            if (!b || !isVisible(object) || object.kind === 'background' || isLocked(object)) return false
            const x = (b.x / 100) * display.width, y = (b.y / 100) * display.height
            const w = (b.width / 100) * display.width, h = (b.height / 100) * display.height
            return x < box.x1 && x + w > box.x0 && y < box.y1 && y + h > box.y0
          }).map(object => object.id)
          onSelectMany?.(hit, marquee.additive)
        }}
        onTouchStart={event => {
          const stage = event.target.getStage()
          if (penActive && stage) {
            const pointer = stage.getPointerPosition()
            if (pointer) onPenPoint?.([toPercent(pointer.x, display.width), toPercent(pointer.y, display.height)])
            return
          }
          if (event.target === stage) onSelect(null)
        }}
      >
        <Layer>
          {drawOrder(document).map(object => {
            const bounds = object.transform.bounds
            if (!bounds) return null

            const widthPx = (bounds.width / 100) * display.width
            const heightPx = (bounds.height / 100) * display.height
            const isBackground = object.kind === 'background'
            const locked = isLocked(object)
            const movable = !locked && !object.constraints.lockPosition && !isBackground
            const image = object.content.assetRef ? images[object.content.assetRef] : undefined
            const holdsPixels = object.kind === 'image' || object.kind === 'logo' || object.kind === 'icon'
            // Roundness and stroke are stored in document pixels; the stage is scaled.
            const radiusPx = Math.min((object.style.borderRadius ?? 0) * display.scale, widthPx / 2, heightPx / 2)
            const strokePx = object.style.strokeWidth != null ? object.style.strokeWidth * display.scale : 1
            // Until a layer has pixels of its own, its own region of the flat flyer
            // stands in. Cropping per layer rather than laying the whole flyer
            // underneath keeps every pixel drawn exactly once: a text layer over a
            // full-frame backdrop would appear twice, at the analyser's box and at
            // the source's original position, which reads as a broken editor.
            const source = image ?? (holdsPixels ? fallbackImage ?? undefined : undefined)
            const crop = source && !image
              ? {
                x: (bounds.x / 100) * source.naturalWidth,
                y: (bounds.y / 100) * source.naturalHeight,
                width: Math.max(1, (bounds.width / 100) * source.naturalWidth),
                height: Math.max(1, (bounds.height / 100) * source.naturalHeight),
              }
              : undefined

            return (
              <Group
                key={object.id}
                x={(bounds.x / 100) * display.width}
                y={(bounds.y / 100) * display.height}
                width={widthPx}
                height={heightPx}
                rotation={object.transform.rotation}
                opacity={object.transform.opacity}
                draggable={movable}
                dragBoundFunc={clampWithinCanvas(object)}
                listening={!isBackground && !penActive}
                ref={node => {
                  if (node) nodeRefs.current.set(object.id, node)
                  else nodeRefs.current.delete(object.id)
                }}
                onMouseDown={event => {
                  if (event.evt.button === 2) return
                  if (event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey) { onSelect(object.id, 'toggle'); return }
                  // Pressing a layer that is already part of the selection keeps the selection, so it drags together.
                  if (!selectedIds.includes(object.id)) onSelect(object.id, 'replace', event.evt.altKey)
                }}
                onClick={event => {
                  // A click (no drag) on one layer of a multi-selection narrows it to that layer.
                  if (many && selectedIds.includes(object.id) && !event.evt.shiftKey && !event.evt.metaKey && !event.evt.ctrlKey) onSelect(object.id, 'replace', event.evt.altKey)
                }}
                onTouchStart={() => onSelect(object.id)}
                onMouseEnter={() => { setHoveredId(object.id); const stage = nodeRefs.current.get(object.id)?.getStage(); if (stage) stage.container().style.cursor = movable ? 'move' : 'default' }}
                onMouseLeave={() => { setHoveredId(current => (current === object.id ? null : current)); const stage = nodeRefs.current.get(object.id)?.getStage(); if (stage) stage.container().style.cursor = 'default' }}
                onContextMenu={event => {
                  event.evt.preventDefault()
                  if (!selectedIds.includes(object.id)) onSelect(object.id)
                  onContextMenu?.(object.id, event.evt.clientX, event.evt.clientY)
                }}
                onDblClick={() => {
                  if (usesTextMetrics(object) && !locked) setEditingId(object.id)
                  onEditText?.(object.id)
                }}
                onDblTap={() => {
                  if (usesTextMetrics(object) && !locked) setEditingId(object.id)
                  onEditText?.(object.id)
                }}
                onDragMove={() => {
                  // Snapping follows one layer; a group moves as it is.
                  const node = nodeRefs.current.get(object.id)
                  if (node && !many) snapOnDrag(object, node)
                }}
                onDragEnd={() => {
                  setGuides({ v: [], h: [] })
                  if (many && selectedIds.includes(object.id)) { commitMany(); return }
                  const node = nodeRefs.current.get(object.id)
                  if (node) commitGeometry(object, node)
                }}
                onTransformEnd={() => {
                  if (many) return
                  const node = nodeRefs.current.get(object.id)
                  if (node) commitGeometry(object, node)
                }}
              >
                {/* Motion: playback moves this group about the layer's centre; at rest it changes nothing. */}
                <Group
                  ref={node => {
                    if (node) motionRefs.current.set(object.id, node)
                    else motionRefs.current.delete(object.id)
                  }}
                  x={widthPx / 2}
                  y={heightPx / 2}
                  offsetX={widthPx / 2}
                  offsetY={heightPx / 2}
                  opacity={editingId === object.id ? 0 : 1}
                >
                <FilteredGroup
                  object={object}
                  pixelScale={display.scale}
                  x={object.transform.flipX ? widthPx : 0}
                  y={object.transform.flipY ? heightPx : 0}
                  scaleX={object.transform.flipX ? -1 : 1}
                  scaleY={object.transform.flipY ? -1 : 1}
                  globalCompositeOperation={compositeOf(object.style.fx)}
                >
                {usesTextMetrics(object) && image ? (
                  // Text lifted by Magic Layers keeps its own pixels until its words or style are edited.
                  <KonvaImage image={image} width={widthPx} height={heightPx} sceneFunc={smoothImage} {...shadowProps(object.style.fx, display.scale)} />
                ) : usesTextMetrics(object) ? (() => {
                  const fontFamily = resolveFamily(object.style.fontFamily, missingFonts)
                  const bold = Number(object.style.fontWeight) >= 600
                  const text = shownText(object)
                  const base = {
                    width: widthPx,
                    wrap: 'word',
                    align: object.style.textAlign || 'left',
                    fontFamily,
                    fontSize: resolvedFontSize(object, { width: widthPx, height: heightPx }, display.scale, fontFamily, bold),
                    fontStyle: konvaFontStyle(object, bold),
                    textDecoration: textDecoration(object),
                    lineHeight: object.style.lineHeight || 1.2,
                    letterSpacing: object.style.letterSpacing ?? 0,
                  }
                  const paint = {
                    fill: object.style.fill || '#ffffff',
                    stroke: object.style.stroke || undefined,
                    strokeWidth: object.style.stroke ? strokePx : 0,
                    fillAfterStrokeEnabled: true,
                    ...shadowProps(object.style.fx, display.scale),
                    ...gradientProps(object.style.fx, widthPx, heightPx),
                  }
                  const gap = (object.style.typography?.paragraphSpacing ?? 0) * display.scale
                  const paragraphs = text.split('\n')
                  if (gap > 0 && paragraphs.length > 1) {
                    // Paragraph spacing: one block per paragraph, measured by Konva itself, centred as a whole.
                    const heights = paragraphs.map(paragraph => new Konva.Text({ ...base, text: paragraph || ' ' }).height())
                    const total = heights.reduce((sum, height) => sum + height, 0) + gap * (paragraphs.length - 1)
                    const place = object.style.typography?.verticalAlign ?? 'middle'
                    let y = place === 'top' ? 0 : place === 'bottom' ? heightPx - total : (heightPx - total) / 2
                    return (
                      <Group>
                        {paragraphs.map((paragraph, index) => {
                          const top = y
                          y += heights[index] + gap
                          return <Text key={index} {...base} {...paint} y={top} text={paragraph} />
                        })}
                      </Group>
                    )
                  }
                  return <Text {...base} {...paint} text={text} height={heightPx} verticalAlign={object.style.typography?.verticalAlign ?? 'middle'} />
                })() : source ? (
                  <KonvaImage
                    sceneFunc={smoothImage}
                    image={source}
                    width={widthPx}
                    height={heightPx}
                    crop={crop}
                    cornerRadius={radiusPx}
                    stroke={object.style.stroke || undefined}
                    strokeWidth={object.style.stroke ? strokePx : 0}
                    {...shadowProps(object.style.fx, display.scale)}
                  />
                ) : holdsPixels ? (
                  // Found by the analyser, not cut out yet: keep the region
                  // clickable and visibly a layer, without pretending to hold
                  // pixels of its own.
                  <Rect
                    width={widthPx}
                    height={heightPx}
                    fill="rgba(0,0,0,0)"
                    stroke="rgba(255,255,255,0.28)"
                    strokeWidth={1}
                    dash={[4, 4]}
                    cornerRadius={4}
                  />
                ) : object.geometry?.type === 'ellipse' ? (
                  <Ellipse
                    x={widthPx / 2}
                    y={heightPx / 2}
                    radiusX={widthPx / 2}
                    radiusY={heightPx / 2}
                    fill={object.style.fill || undefined}
                    stroke={object.style.stroke || undefined}
                    strokeWidth={object.style.stroke ? strokePx : 0}
                    {...shadowProps(object.style.fx, display.scale)}
                    {...gradientProps(object.style.fx, widthPx, heightPx)}
                    fillLinearGradientStartPoint={object.style.fx?.gradient ? { x: (gradientProps(object.style.fx, widthPx, heightPx).fillLinearGradientStartPoint?.x ?? 0) - widthPx / 2, y: (gradientProps(object.style.fx, widthPx, heightPx).fillLinearGradientStartPoint?.y ?? 0) - heightPx / 2 } : undefined}
                    fillLinearGradientEndPoint={object.style.fx?.gradient ? { x: (gradientProps(object.style.fx, widthPx, heightPx).fillLinearGradientEndPoint?.x ?? 0) - widthPx / 2, y: (gradientProps(object.style.fx, widthPx, heightPx).fillLinearGradientEndPoint?.y ?? 0) - heightPx / 2 } : undefined}
                  />
                ) : object.geometry?.type === 'line' || object.geometry?.type === 'path' ? (
                  <Line
                    points={(object.geometry.points ?? []).flatMap(([px, py]) => [px * widthPx, py * heightPx])}
                    closed={object.geometry.type === 'path' && object.geometry.closed !== false}
                    fill={object.geometry.type === 'path' && object.geometry.closed !== false ? object.style.fill || undefined : undefined}
                    stroke={object.style.stroke || undefined}
                    strokeWidth={object.style.stroke ? Math.max(1, strokePx) : 0}
                    lineCap="round"
                    lineJoin="round"
                    hitStrokeWidth={Math.max(18, strokePx)}
                    {...shadowProps(object.style.fx, display.scale)}
                    {...gradientProps(object.style.fx, widthPx, heightPx)}
                  />
                ) : (
                  <Rect
                    width={widthPx}
                    height={heightPx}
                    fill={object.style.fill || (isBackground ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)')}
                    stroke={object.style.stroke || undefined}
                    strokeWidth={object.style.stroke ? strokePx : 0}
                    cornerRadius={radiusPx}
                    {...shadowProps(object.style.fx, display.scale)}
                    {...gradientProps(object.style.fx, widthPx, heightPx)}
                  />
                )}
                </FilteredGroup>
                </Group>
              </Group>
            )
          })}
        </Layer>
        <Layer>
          {penPoints.length ? (
            <Group listening={false}>
              <Line
                points={penPoints.flatMap(([px, py]) => [(px / 100) * display.width, (py / 100) * display.height])}
                stroke="#9dfab0"
                strokeWidth={2}
                dash={[6, 4]}
                lineJoin="round"
              />
              {penPoints.map(([px, py], index) => (
                <Circle
                  key={index}
                  x={(px / 100) * display.width}
                  y={(py / 100) * display.height}
                  radius={index === 0 ? 6 : 4}
                  fill={index === 0 ? '#9dfab0' : '#050606'}
                  stroke="#9dfab0"
                  strokeWidth={1.5}
                />
              ))}
            </Group>
          ) : null}
          {hoveredObject?.transform.bounds ? (
            <Rect
              listening={false}
              x={(hoveredObject.transform.bounds.x / 100) * display.width}
              y={(hoveredObject.transform.bounds.y / 100) * display.height}
              width={(hoveredObject.transform.bounds.width / 100) * display.width}
              height={(hoveredObject.transform.bounds.height / 100) * display.height}
              rotation={hoveredObject.transform.rotation}
              stroke="rgba(157, 250, 176, 0.7)"
              strokeWidth={1.5}
            />
          ) : null}
          {marquee ? (
            <Rect
              listening={false}
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="rgba(157, 250, 176, 0.08)"
              stroke="rgba(157, 250, 176, 0.9)"
              strokeWidth={1}
              dash={[4, 3]}
            />
          ) : null}
          {guides.v.map(x => <Line key={`v${x}`} listening={false} points={[x, 0, x, display.height]} stroke="#ff4fd8" strokeWidth={1} dash={[4, 3]} />)}
          {guides.h.map(y => <Line key={`h${y}`} listening={false} points={[0, y, display.width, y]} stroke="#ff4fd8" strokeWidth={1} dash={[4, 3]} />)}
          {/* Corners keep text and pictures in proportion (text scales with them); sides reshape freely. Rotation snaps every 45 degrees. */}
          <Transformer
            ref={transformerRef}
            rotateEnabled={!selectedObject?.constraints.lockRotation}
            resizeEnabled={!selectedObject?.constraints.lockSize}
            keepRatio={many || Boolean(selectedObject?.constraints.lockAspectRatio) || Boolean(selectedObject && (usesTextMetrics(selectedObject) || ['image', 'logo', 'icon', 'qr-code'].includes(selectedObject.kind)))}
            onTransformStart={() => { anchorRef.current = transformerRef.current?.getActiveAnchor() ?? null }}
            onTransformEnd={() => { if (many) commitMany() }}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={5}
            flipEnabled={false}
            borderStroke="rgba(157, 250, 176, 0.85)"
            borderStrokeWidth={1}
            anchorStroke="rgba(157, 250, 176, 0.95)"
            anchorFill="#050606"
            anchorSize={8}
            anchorCornerRadius={2}
            rotateAnchorOffset={20}
            enabledAnchors={many || selectedObject?.constraints.lockAspectRatio
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
              : undefined}
          />
        </Layer>
      </Stage>
      {editingObject?.transform.bounds && usesTextMetrics(editingObject) ? (() => {
        const b = editingObject.transform.bounds
        const w = (b.width / 100) * display.width, h = (b.height / 100) * display.height
        const family = resolveFamily(editingObject.style.fontFamily, missingFonts)
        const bold = Number(editingObject.style.fontWeight) >= 600
        const size = resolvedFontSize(editingObject, { width: w, height: h }, display.scale, family, bold)
        const lineHeight = editingObject.style.lineHeight || 1.2
        const text = editingObject.content.text || ''
        const lines = Math.max(1, text.split('\n').length)
        return (
          <textarea
            autoFocus
            spellCheck={false}
            aria-label={`Edit ${editingObject.name}`}
            defaultValue={text}
            onChange={event => onTextChange?.(editingObject.id, event.target.value)}
            onBlur={() => setEditingId(null)}
            onKeyDown={event => {
              event.stopPropagation()
              if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key === 'Enter')) setEditingId(null)
            }}
            onFocus={event => event.currentTarget.select()}
            className="absolute z-10 resize-none overflow-hidden border-0 bg-transparent p-0 outline outline-1 outline-dashed outline-[#9dfab0] [caret-color:#9dfab0]"
            style={{
              left: (b.x / 100) * display.width,
              top: (b.y / 100) * display.height,
              width: w,
              height: h,
              transform: editingObject.transform.rotation ? `rotate(${editingObject.transform.rotation}deg)` : undefined,
              transformOrigin: 'top left',
              paddingTop: (() => {
                const room = Math.max(0, h - lines * size * lineHeight)
                const place = editingObject.style.typography?.verticalAlign ?? 'middle'
                return place === 'top' ? 0 : place === 'bottom' ? room : room / 2
              })(),
              fontFamily: family,
              fontWeight: /^\d{3}$/.test(editingObject.style.fontWeight || '') ? Number(editingObject.style.fontWeight) : bold ? 700 : 400,
              fontSize: size,
              fontStyle: editingObject.style.typography?.italic ? 'italic' : undefined,
              textDecoration: textDecoration(editingObject) || undefined,
              textTransform: ({ upper: 'uppercase', lower: 'lowercase', title: 'capitalize' } as const)[editingObject.style.typography?.case as 'upper'] ?? undefined,
              lineHeight,
              letterSpacing: (editingObject.style.letterSpacing ?? 0) * display.scale,
              textAlign: editingObject.style.textAlign || 'left',
              color: editingObject.style.fill || '#ffffff',
            }}
          />
        )
      })() : null}
      {/* Floating text toolbar: alignment right above the selected text box. */}
      {onTextAlign && !many && !editingObject && selectedObject && usesTextMetrics(selectedObject) && selectedObject.transform.bounds && !selectedObject.protection.locked ? (() => {
        const b = selectedObject.transform.bounds
        const left = ((b.x + b.width / 2) / 100) * display.width
        const top = (b.y / 100) * display.height
        return (
          <div
            className="pointer-events-auto absolute z-20 -translate-x-1/2 rounded-xl border border-white/[0.12] bg-[#15161a]/95 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            style={{ left: Math.min(Math.max(left, 150), Math.max(150, display.width - 150)), top: Math.max(4, top - 48) }}
            onPointerDown={event => event.stopPropagation()}
          >
            <TextAlignControls
              variant="toolbar"
              textAlign={(selectedObject.style.textAlign as HorizontalAlign | null) ?? 'left'}
              verticalAlign={selectedObject.style.typography?.verticalAlign ?? 'middle'}
              onChange={patch => onTextAlign(selectedObject.id, patch)}
            />
          </div>
        )
      })() : null}
      {scanning ? (
        <div
          role="status"
          aria-live="polite"
          className="magic-scan pointer-events-none absolute overflow-hidden"
          style={{
            left: `${scanning.frame.x}%`,
            top: `${scanning.frame.y}%`,
            width: `${scanning.frame.width}%`,
            height: `${scanning.frame.height}%`,
          }}
        >
          <span className="magic-scan__sweep" />
          <span className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[11px] text-white backdrop-blur">
            <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15">
              <span className="block h-full rounded-full bg-[#9dfab0] transition-[width] duration-300" style={{ width: `${Math.round(scanning.progress * 100)}%` }} />
            </span>
            <span className="shrink-0">{scanning.label}</span>
          </span>
        </div>
      ) : null}
      </div>
      </div>
      </div>
    </div>
  )
}
