import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { DesignDocument, DesignObject, PercentBox } from '../../core/design-document'
import { resolveFamily } from '../../lib/fonts'
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
  onSelect: (objectId: string | null) => void
  onGeometryChange: (objectId: string, bounds: PercentBox, rotation: number) => void
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
  onSelect,
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
}: LayerCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const nodeRefs = useRef(new Map<string, Konva.Group>())
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

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
    const node = selectedObject ? nodeRefs.current.get(selectedObject.id) : null
    transformer.nodes(node && !isLocked(selectedObject!) ? [node] : [])
    transformer.getLayer()?.batchDraw()
  }, [selectedId, selectedObject, display.width])

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

    onGeometryChange(object.id, {
      x: toPercent(node.x(), display.width),
      y: toPercent(node.y(), display.height),
      width: Math.min(100, toPercent(widthPx, display.width)),
      height: Math.min(100, toPercent(heightPx, display.height)),
    }, rotation)

    // Snap the node back to the document before React re-renders. If the intent is
    // rejected by a constraint the props never change, and the node would
    // otherwise keep the position the pointer left it in.
    node.position({ x: (bounds.x / 100) * display.width, y: (bounds.y / 100) * display.height })
    node.width((bounds.width / 100) * display.width)
    node.height((bounds.height / 100) * display.height)
    node.rotation(object.transform.rotation)
  }, [display.height, display.width, onGeometryChange, toPercent])

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

  if (!display.width || !display.height) {
    return <div ref={containerRef} className={className} aria-busy="true" />
  }

  return (
    <div ref={containerRef} onScroll={rememberCentre} className={`overflow-auto [scrollbar-gutter:stable] ${className ?? ''}`}>
      {/* w-max + m-auto: centred while it fits, scrollable from every edge once zoomed past the viewport. */}
      <div className="flex h-max min-h-full w-max min-w-full" style={{ padding: FRAME_PADDING }}>
      <div className="m-auto">
      {artboardLabel ? (
        <p className="truncate text-[10px] font-medium text-muted-foreground" style={{ height: LABEL_HEIGHT, maxWidth: display.width }}>{artboardLabel}</p>
      ) : null}
      <div className="shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_24px_70px_rgba(0,0,0,0.55)]" style={{ width: display.width, height: display.height }}>
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
          if (event.target === stage) onSelect(null)
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
                onMouseDown={() => onSelect(object.id)}
                onTouchStart={() => onSelect(object.id)}
                onDblClick={() => onEditText?.(object.id)}
                onDblTap={() => onEditText?.(object.id)}
                onDragEnd={() => {
                  const node = nodeRefs.current.get(object.id)
                  if (node) commitGeometry(object, node)
                }}
                onTransformEnd={() => {
                  const node = nodeRefs.current.get(object.id)
                  if (node) commitGeometry(object, node)
                }}
              >
                <Group
                  x={object.transform.flipX ? widthPx : 0}
                  y={object.transform.flipY ? heightPx : 0}
                  scaleX={object.transform.flipX ? -1 : 1}
                  scaleY={object.transform.flipY ? -1 : 1}
                >
                {usesTextMetrics(object) ? (() => {
                  const fontFamily = resolveFamily(object.style.fontFamily, missingFonts)
                  const bold = Number(object.style.fontWeight) >= 600
                  return (
                  <Text
                    text={object.content.text || ''}
                    width={widthPx}
                    height={heightPx}
                    wrap="word"
                    align={object.style.textAlign || 'left'}
                    verticalAlign="middle"
                    fontFamily={fontFamily}
                    fontSize={resolvedFontSize(object, { width: widthPx, height: heightPx }, display.scale, fontFamily, bold)}
                    fontStyle={bold ? 'bold' : 'normal'}
                    fill={object.style.fill || '#ffffff'}
                    lineHeight={object.style.lineHeight || 1.2}
                    letterSpacing={object.style.letterSpacing ?? 0}
                    stroke={object.style.stroke || undefined}
                    strokeWidth={object.style.stroke ? strokePx : 0}
                    fillAfterStrokeEnabled
                  />
                  )
                })() : source ? (
                  <KonvaImage
                    image={source}
                    width={widthPx}
                    height={heightPx}
                    crop={crop}
                    cornerRadius={radiusPx}
                    stroke={object.style.stroke || undefined}
                    strokeWidth={object.style.stroke ? strokePx : 0}
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
                  />
                ) : (
                  <Rect
                    width={widthPx}
                    height={heightPx}
                    fill={object.style.fill || (isBackground ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)')}
                    stroke={object.style.stroke || undefined}
                    strokeWidth={object.style.stroke ? strokePx : 0}
                    cornerRadius={radiusPx}
                  />
                )}
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
          {/* Free transform: any anchor, any form. Shift keeps proportions; rotation snaps every 45 degrees. */}
          <Transformer
            ref={transformerRef}
            rotateEnabled={!selectedObject?.constraints.lockRotation}
            resizeEnabled={!selectedObject?.constraints.lockSize}
            keepRatio={Boolean(selectedObject?.constraints.lockAspectRatio)}
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
            enabledAnchors={selectedObject?.constraints.lockAspectRatio
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
              : undefined}
          />
        </Layer>
      </Stage>
      </div>
      </div>
      </div>
    </div>
  )
}
