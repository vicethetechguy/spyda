import { useEffect, useRef } from 'react'
import BrandMark from './brand/BrandMark'

/**
 * The SPYDA token as a minted coin: a metallic mint rim with a reeded edge,
 * real thickness built from stacked slices so it reads as solid metal when it
 * turns, an enamel field with the embossed mark, and a quiet back face.
 *
 * It rests and sways, then is tossed: it lifts, flips to the other face with a
 * small overshoot, lands with a flare of light and a sweep of shine. The whole
 * coin also leans toward the mouse. Under reduced motion it rests at an angle.
 * The toss is CSS (index.css, "Spyda coin"); only the lean uses script.
 */

const EDGE_SLICES = 14
const THICKNESS = 18 // px, front face to back face
const LEAN = 12 // degrees at the edge of the scene

function CoinLettering({ id, text }: { id: string; text: string }) {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <path id={id} d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0" />
      </defs>
      <text className="spyda-coin__lettering">
        <textPath href={`#${id}`} startOffset="0">{text}</textPath>
      </text>
    </svg>
  )
}

function CoinFace({ side, transform }: { side: 'front' | 'back'; transform: string }) {
  return (
    <div className={`spyda-coin__face spyda-coin__face--${side}`} style={{ transform }}>
      <div className="spyda-coin__rim" />
      <div className="spyda-coin__reeding" />
      <div className="spyda-coin__field">
        <div className="spyda-coin__beads" />
        {side === 'front' ? (
          <>
            <CoinLettering id="spyda-coin-front-text" text="SPYDA TOKEN · CREATE · ACCRUE · LAUNCH TOGETHER ·" />
            <div className="spyda-coin__mark"><BrandMark className="h-full w-full" /></div>
            <span className="spyda-coin__ticker">SPYDA</span>
          </>
        ) : (
          <>
            <div className="spyda-coin__guilloche" />
            <CoinLettering id="spyda-coin-back-text" text="EARNED BY CREATING · EARNED BY CREATING ·" />
            <div className="spyda-coin__value">
              <span className="spyda-coin__value-number">10K</span>
              <span className="spyda-coin__value-unit">SPYDA</span>
            </div>
          </>
        )}
      </div>
      <div className="spyda-coin__shine" />
    </div>
  )
}

export default function SpydaCoin() {
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const leanRef = useRef<HTMLDivElement | null>(null)

  // The coin leans toward the mouse, eased so it feels weighty.
  useEffect(() => {
    const scene = sceneRef.current
    const lean = leanRef.current
    if (!scene || !lean || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let target = { x: 0, y: 0 }
    const now = { x: 0, y: 0 }
    const step = () => {
      now.x += (target.x - now.x) * 0.08
      now.y += (target.y - now.y) * 0.08
      lean.style.transform = `rotateX(${now.y.toFixed(2)}deg) rotateY(${now.x.toFixed(2)}deg)`
      frame = Math.abs(target.x - now.x) + Math.abs(target.y - now.y) > 0.02 ? requestAnimationFrame(step) : 0
    }
    const kick = () => { if (!frame) frame = requestAnimationFrame(step) }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const box = scene.getBoundingClientRect()
      const px = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width - 0.5) * 2))
      const py = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height - 0.5) * 2))
      target = { x: px * LEAN, y: -py * LEAN }
      kick()
    }
    const leave = () => { target = { x: 0, y: 0 }; kick() }
    scene.addEventListener('pointermove', move)
    scene.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(frame)
      scene.removeEventListener('pointermove', move)
      scene.removeEventListener('pointerleave', leave)
    }
  }, [])

  const half = THICKNESS / 2
  return (
    <div ref={sceneRef} className="relative mx-auto aspect-square w-full max-w-[430px]" role="img" aria-label="The SPYDA token, earned by creating: up to 10,000 SPYDA for every 1,000 credits used, the earlier you join">
      {/* Two quiet rings, one light travelling each */}
      <div className="absolute inset-[4%] rounded-full border border-white/[0.06]" />
      <div className="absolute inset-[14%] rounded-full border border-primary/[0.12]" />
      <div className="spyda-orbit spyda-orbit--outer absolute inset-[4%]"><span className="spyda-orbit__dot bg-primary shadow-[0_0_16px_rgba(157,250,176,0.95)]" /></div>
      <div className="spyda-orbit spyda-orbit--inner absolute inset-[14%]"><span className="spyda-orbit__dot bg-[#8bd3ff] shadow-[0_0_16px_rgba(139,211,255,0.95)]" /></div>
      <div className="spyda-coin-glow absolute inset-[20%] rounded-full" />
      <div className="spyda-coin-flare absolute inset-[16%] rounded-full" />

      {/* The coin */}
      <div className="spyda-coin-scene absolute inset-0 flex items-center justify-center">
        <div ref={leanRef} className="spyda-coin-lean">
          <div className="spyda-coin-toss">
            <div className="spyda-coin">
              {Array.from({ length: EDGE_SLICES }, (_, index) => {
                const z = -half + 1 + (index * (THICKNESS - 2)) / (EDGE_SLICES - 1)
                return <div key={index} className="spyda-coin__edge" style={{ transform: `translateZ(${z.toFixed(2)}px)` }} />
              })}
              <CoinFace side="front" transform={`translateZ(${half}px)`} />
              <CoinFace side="back" transform={`rotateY(180deg) translateZ(${half}px)`} />
            </div>
          </div>
        </div>
        <div className="spyda-coin-shadow" />
      </div>
    </div>
  )
}
