import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva'
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
}

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
    const available = viewport.height || (viewport.width ? viewport.width / aspect : 0)
    if (!viewport.width || !available) return { width: 0, height: 0, scale: 1 }
    const byWidth = { width: viewport.width, height: viewport.width / aspect }
    const fitted = byWidth.height <= available
      ? byWidth
      : { width: available * aspect, height: available }
    const width = Math.max(MIN_DISPLAY_SIZE, Math.floor(fitted.width))
    const height = Math.max(MIN_DISPLAY_SIZE, Math.floor(fitted.height))
    const baseWidth = document.canvas.width || backgroundImage?.naturalWidth || width
    return { width, height, scale: width / baseWidth }
  }, [aspect, backgroundImage, document.canvas.width, viewport.height, viewport.width])

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
    <div ref={containerRef} className={className}>
      <Stage
        ref={node => { if (stageRef) stageRef.current = node }}
        width={display.width}
        height={display.height}
        onMouseDown={event => {
          if (event.target === event.target.getStage()) onSelect(null)
        }}
        onTouchStart={event => {
          if (event.target === event.target.getStage()) onSelect(null)
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
                listening={!isBackground}
                ref={node => {
                  if (node) nodeRefs.current.set(object.id, node)
                  else nodeRefs.current.delete(object.id)
                }}
                onMouseDown={() => onSelect(object.id)}
                onTouchStart={() => onSelect(object.id)}
                onDragEnd={() => {
                  const node = nodeRefs.current.get(object.id)
                  if (node) commitGeometry(object, node)
                }}
                onTransformEnd={() => {
                  const node = nodeRefs.current.get(object.id)
                  if (node) commitGeometry(object, node)
                }}
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
                    listening={false}
                  />
                  )
                })() : source ? (
                  <KonvaImage
                    image={source}
                    width={widthPx}
                    height={heightPx}
                    crop={crop}
                    listening={false}
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
                ) : (
                  <Rect
                    width={widthPx}
                    height={heightPx}
                    fill={object.style.fill || (isBackground ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)')}
                    stroke={object.style.stroke || undefined}
                    strokeWidth={object.style.stroke ? 1 : 0}
                    cornerRadius={object.style.borderRadius ?? 0}
                    listening={false}
                  />
                )}
              </Group>
            )
          })}
        </Layer>
        <Layer>
          <Transformer
            ref={transformerRef}
            rotateEnabled={!selectedObject?.constraints.lockRotation}
            resizeEnabled={!selectedObject?.constraints.lockSize}
            keepRatio={Boolean(selectedObject?.constraints.lockAspectRatio)}
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
  )
}
