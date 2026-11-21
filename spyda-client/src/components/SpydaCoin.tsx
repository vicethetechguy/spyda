import { Gift, Network } from 'lucide-react'

/**
 * The SPYDA token as a minted coin: a metallic mint rim with a reeded edge,
 * real thickness built from stacked slices so it reads as solid metal when it
 * turns, an enamel field with the embossed mark and lettering, and a back face
 * with the reward rate. It spins slowly, floats, and catches a light sweep;
 * particles orbit the rings. Under reduced motion it rests at an angle.
 * All motion is CSS (index.css, "Spyda coin"), so it costs no script per frame.
 */

const EDGE_SLICES = 14
const THICKNESS = 18 // px, front face to back face

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
            <img src="/assets/spyda-credit.png" alt="" className="spyda-coin__mark" />
            <span className="spyda-coin__ticker">SPYDA</span>
          </>
        ) : (
          <>
            <CoinLettering id="spyda-coin-back-text" text="PRE-LAUNCH ALLOCATION · EARNED BY CREATING ·" />
            <div className="spyda-coin__value">
              <span className="spyda-coin__value-number">1</span>
              <span className="spyda-coin__value-unit">SPYDA</span>
              <span className="spyda-coin__value-rate">per 1,000 credits</span>
            </div>
          </>
        )}
      </div>
      <div className="spyda-coin__shine" />
    </div>
  )
}

export default function SpydaCoin() {
  const half = THICKNESS / 2
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[430px]" role="img" aria-label="The SPYDA token, a coin earned at 1 SPYDA for every 1,000 credits used">
      {/* Rings and the particles that orbit them */}
      <div className="absolute inset-[3%] rounded-full border border-dashed border-primary/25 motion-safe:animate-[spin_28s_linear_infinite]" />
      <div className="absolute inset-[12%] rounded-full border border-[#88a8ff]/20" />
      <div className="spyda-orbit spyda-orbit--outer absolute inset-[3%]"><span className="spyda-orbit__dot bg-primary shadow-[0_0_14px_rgba(157,250,176,0.9)]" /></div>
      <div className="spyda-orbit spyda-orbit--inner absolute inset-[12%]"><span className="spyda-orbit__dot bg-[#8bd3ff] shadow-[0_0_14px_rgba(139,211,255,0.9)]" /></div>
      <div className="spyda-coin-glow absolute inset-[22%] rounded-full" />

      {/* The coin */}
      <div className="spyda-coin-scene absolute inset-0 flex items-center justify-center">
        <div className="spyda-coin-float">
          <div className="spyda-coin">
            {Array.from({ length: EDGE_SLICES }, (_, index) => {
              const z = -half + 1 + (index * (THICKNESS - 2)) / (EDGE_SLICES - 1)
              return <div key={index} className="spyda-coin__edge" style={{ transform: `translateZ(${z.toFixed(2)}px)` }} />
            })}
            <CoinFace side="front" transform={`translateZ(${half}px)`} />
            <CoinFace side="back" transform={`rotateY(180deg) translateZ(${half}px)`} />
          </div>
        </div>
        <div className="spyda-coin-shadow" />
      </div>

      {/* Chips */}
      <div className="spyda-chip absolute left-0 top-[20%] rounded-xl border border-white/[0.09] bg-black/70 px-3 py-2 backdrop-blur-md">
        <p className="text-[9px] font-semibold uppercase text-muted-foreground">Earn rate</p>
        <p className="mt-1 text-xs font-semibold text-primary">1,000 : 1</p>
      </div>
      <div className="spyda-chip spyda-chip--late absolute bottom-[16%] right-0 rounded-xl border border-white/[0.09] bg-black/70 px-3 py-2 text-right backdrop-blur-md">
        <p className="text-[9px] font-semibold uppercase text-muted-foreground">Launch mission</p>
        <p className="mt-1 text-xs font-semibold text-[#a9bcff]">1B user-earned</p>
      </div>
      <div className="spyda-chip spyda-chip--slow absolute right-[8%] top-[8%] flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-[#0b0e0d] text-primary shadow-[0_0_24px_rgba(157,250,176,.15)]"><Network className="h-3.5 w-3.5" /></div>
      <div className="spyda-chip spyda-chip--late absolute bottom-[8%] left-[12%] flex h-8 w-8 items-center justify-center rounded-full border border-[#ff8f5c]/30 bg-[#0b0e0d] text-[#ffab84]"><Gift className="h-3.5 w-3.5" /></div>
    </div>
  )
}
