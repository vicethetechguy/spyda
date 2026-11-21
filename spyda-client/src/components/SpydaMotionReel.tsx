import { useEffect, useRef } from 'react'

/**
 * Plays the landing motion piece (lib/motion-reel) on a canvas: sharp at any
 * size, no video download, paused off screen, one finished frame under
 * reduced motion.
 */

import { REEL_DURATION, drawReel } from '../lib/motion-reel'

export default function SpydaMotionReel({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let visible = false
    let started = performance.now()

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      return { width, height }
    }
    let size = resize()

    const render = (now: number) => {
      const t = reduced ? 6.6 : ((now - started) / 1000) % REEL_DURATION
      drawReel(context, size.width, size.height, t)
      if (!reduced && visible) frame = requestAnimationFrame(render)
    }

    // Fonts first, so the first typed letters are not drawn in a fallback face.
    document.fonts?.ready.then(() => render(performance.now()))

    const observer = new IntersectionObserver(([entry]) => {
      const wasVisible = visible
      visible = entry.isIntersecting
      if (visible && !wasVisible) {
        started = performance.now()
        frame = requestAnimationFrame(render)
      }
      if (!visible) cancelAnimationFrame(frame)
    }, { threshold: 0.15 })
    observer.observe(canvas)

    const onResize = () => {
      size = resize()
      if (!visible || reduced) render(performance.now())
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(canvas)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className={`block h-full w-full ${className}`} />
}
