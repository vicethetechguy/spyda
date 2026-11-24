import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Blocks,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  Clapperboard,
  Clock,
  Coins,
  Download,
  FolderKanban,
  Gift,
  History,
  Image as ImageIcon,
  Layers3,
  Library,
  MessageSquareText,
  Mic,
  Network,
  Palette,
  PanelLeftClose,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Type,
  Upload,
  Wallet,
  WandSparkles,
  X,
  Zap,
} from '../components/ui/icons'

import {
  INSTALL_AVAILABLE_EVENT,
  INSTALL_COMPLETED_EVENT,
  clearInstallPrompt,
  getInstallPrompt,
} from '../lib/pwa-install'
import BrandMark from '../components/brand/BrandMark'
import HeroField from '../components/HeroField'
import SpydaCoin from '../components/SpydaCoin'
import SpydaMotionReel from '../components/SpydaMotionReel'
import { useCardDeck } from '../components/landing/useCardDeck'

/* ── Hero mockup: a faithful miniature of the real Spyda workspace (chat-first, icon rail) ── */

function MockRailIcon({ icon: Icon, active, badge }: { icon: React.ElementType; active?: boolean; badge?: string }) {
  return (
    <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${active ? 'bg-[#0b1412] ring-2 ring-primary shadow-[0_6px_16px_rgba(157,250,176,0.22)]' : 'border border-white/[0.07] bg-white/[0.03] text-muted-foreground'}`}>
      <Icon className="h-3 w-3" strokeWidth={1.7} />
      {badge ? <span className="absolute -right-0.5 -top-0.5 flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-primary px-0.5 text-[6px] font-bold text-primary-foreground ring-1 ring-[#08090a]">{badge}</span> : null}
    </span>
  )
}

function MockSpydaAiIcon() {
  return <img src="/assets/spyda-logo.png" alt="" className="h-3.5 w-3.5 object-contain" />
}

function WorkspaceMockup() {
  return (
    <div className="relative mx-auto mt-4 overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#08090a] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
      <div className="flex h-[440px] select-none sm:h-[500px]" aria-hidden="true">
        {/* Icon rail */}
        <div className="hidden w-12 shrink-0 flex-col items-center border-r border-white/[0.06] bg-[#08090a] py-3 sm:flex">
          <img src="/assets/spyda-logo.png" alt="" className="mb-3 h-6 w-6 object-contain" />
          <div className="flex flex-1 flex-col items-center gap-2 py-1">
            <MockRailIcon icon={MockSpydaAiIcon} active />
            <MockRailIcon icon={ImageIcon} />
            <MockRailIcon icon={Clock} />
            <MockRailIcon icon={Gift} badge="2" />
            <MockRailIcon icon={FolderKanban} />
            <MockRailIcon icon={Blocks} />
            <MockRailIcon icon={Palette} />
            <MockRailIcon icon={BookOpen} />
          </div>
          <div className="flex flex-col items-center gap-2 border-t border-white/[0.06] pt-2">
            <MockRailIcon icon={Wallet} />
            <MockRailIcon icon={Settings} />
          </div>
        </div>

        {/* Main */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
            <div className="flex items-center gap-2 text-[10px]">
              <PanelLeftClose className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
              <span className="hidden text-muted-foreground sm:inline">My Workspace</span>
              <span className="hidden text-muted-foreground/30 sm:inline">/</span>
              <span className="font-semibold text-foreground">Spyda AI</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden h-5 w-5 items-center justify-center rounded-full border border-white/[0.08] text-muted-foreground sm:flex"><History className="h-2.5 w-2.5" /></span>
              <span className="hidden h-5 w-5 items-center justify-center rounded-full border border-white/[0.08] text-muted-foreground sm:flex"><Plus className="h-2.5 w-2.5" /></span>
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-primary px-2 text-[8px] font-bold text-primary-foreground"><Layers3 className="h-2.5 w-2.5" /> Canvas mode</span>
              <span className="hidden h-5 items-center gap-1 rounded-full border border-white/[0.08] px-2 text-[8px] font-medium text-muted-foreground md:inline-flex">
                <Bot className="h-2.5 w-2.5 text-primary" /> Groq + GPT-Image 2 <ChevronDown className="h-2 w-2" />
              </span>
              <Bell className="hidden h-3 w-3 text-muted-foreground sm:block" />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-[8px] font-bold text-primary-foreground">S</span>
            </div>
          </div>

          {/* Conversation */}
          <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-3 pt-3 sm:px-6">
            <div className="flex justify-end">
              <div className="flex max-w-[78%] flex-col items-end gap-1.5">
                <img src="/assets/spyda-sample-04.jpeg" alt="" className="h-20 w-auto rounded-[12px] border border-white/10 object-cover sm:h-24" loading="lazy" />
                <p className="rounded-[14px] rounded-br-sm bg-surface-raised px-3 py-1.5 text-[10px] leading-4 text-foreground">Make it mine: “Grand Opening, this Saturday”, and use our logo.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-[#0b1412]"><img src="/assets/spyda-logo.png" alt="" className="h-3 w-3 object-contain" /></span>
              <div className="min-w-0 max-w-[86%]">
                <p className="text-[10px] leading-4 text-foreground/85">Here is your version: same layout and lighting, with your headline and logo. Open it in canvas mode to fine-tune any layer, or animate it.</p>
                <div className="mt-2 flex items-start gap-2">
                  <div className="relative w-28 overflow-hidden rounded-[12px] border border-primary/25 sm:w-32">
                    <img src="/assets/spyda-sample-04.jpeg" alt="" className="aspect-[4/5] w-full object-cover object-center" loading="lazy" />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[7px] font-bold text-primary backdrop-blur-sm">Your version</span>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-primary px-2 text-[8px] font-bold text-primary-foreground"><Download className="h-2.5 w-2.5" /> Download</span>
                    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-white/[0.1] px-2 text-[8px] font-semibold text-foreground/85"><Layers3 className="h-2.5 w-2.5 text-primary" /> Open in canvas</span>
                    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-white/[0.1] px-2 text-[8px] font-semibold text-foreground/85"><Clapperboard className="h-2.5 w-2.5 text-primary" /> Animate</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Composer, as in the app */}
          <div className="shrink-0 px-3 pb-3 pt-2 sm:px-6">
            <div className="rounded-[18px] border border-primary/20 bg-[linear-gradient(180deg,rgba(18,134,111,0.34),rgba(12,91,134,0.22))] p-0.5">
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[8px] text-foreground/80">
                <span className="flex min-w-0 items-center gap-1 truncate"><img src="/assets/spyda-logo.png" alt="" className="h-2.5 w-2.5 object-contain" /> First 1,000 users earn 10,000 SPYDA per 1,000 credits</span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 font-bold text-primary"><Coins className="h-2 w-2" /> 3,530 credits</span>
              </div>
              <div className="rounded-[15px] border border-white/[0.06] bg-[#08090a] px-2.5 pb-2 pt-2">
                <p className="text-[10px] text-muted-foreground/70">Import a flyer and tell Spyda what to change…</p>
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-white/[0.08] px-2 text-[8px] text-foreground/80"><Paperclip className="h-2.5 w-2.5" /> Import file</span>
                    <span className="flex h-5 overflow-hidden rounded-full border border-white/[0.08]">
                      <span className="flex w-6 items-center justify-center bg-primary text-primary-foreground"><ImageIcon className="h-2.5 w-2.5" /></span>
                      <span className="flex w-6 items-center justify-center text-muted-foreground"><Clapperboard className="h-2.5 w-2.5" /></span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.05] text-muted-foreground"><Mic className="h-2.5 w-2.5" /></span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.08] text-foreground/80"><ArrowUp className="h-2.5 w-2.5" /></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

/* ── Shared pieces of the card-and-pill look ── */

/** Mint pill with its round arrow badge: the page's one primary action style. */
function PrimaryPill({ to, children, className = '' }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`group inline-flex h-12 items-center justify-between gap-3 rounded-full bg-primary pl-6 pr-1.5 whitespace-nowrap font-heading text-[12px] font-semibold uppercase tracking-[0.14em] text-primary-foreground shadow-[0_14px_40px_rgba(157,250,176,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(157,250,176,0.3)] active:translate-y-0 active:scale-[0.98] ${className}`}
    >
      {children}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#050606] text-primary transition-transform duration-200 group-hover:rotate-45">
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </Link>
  )
}

/** The dark pill that sits beside the mint one. */
function SecondaryPill({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-[#04161a]/55 px-6 whitespace-nowrap font-heading text-[12px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#04161a]/75 active:translate-y-0 active:scale-[0.98] ${className}`}
    >
      {children}
    </a>
  )
}

/** A round icon set inline with headline type, like a word of its own. */
function HeadlineChip({ icon: Icon, tone }: { icon: React.ElementType; tone: 'mint' | 'sky' | 'peach' }) {
  const tones = {
    mint: 'bg-primary text-primary-foreground',
    sky: 'bg-[#8bd3ff] text-[#06202e]',
    peach: 'bg-[#ffab84] text-[#3a1503]',
  }
  return (
    <span aria-hidden="true" className={`mx-[0.12em] inline-flex h-[0.86em] w-[0.86em] -translate-y-[0.06em] items-center justify-center rounded-full align-middle ${tones[tone]}`}>
      <Icon className="h-[0.46em] w-[0.46em]" strokeWidth={2.2} />
    </span>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-6 flex items-center justify-center gap-2 font-heading text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      {children}
    </p>
  )
}

/* ── Motion preview: a story-format frame whose parts move like a Spyda motion ── */

function MotionPreview() {
  // A 4:5 frame on phones so it stays inside one screen; the 9:16 story frame
  // from tablets up. The reel inside is a live Spyda motion piece.
  return (
    <div className="relative mx-auto w-[min(80vw,320px)] sm:w-full sm:max-w-[320px] lg:max-w-[360px]">
      <div aria-hidden="true" className="absolute -inset-6 rounded-[48px] bg-[radial-gradient(closest-side,rgba(18,134,111,0.4),transparent)] blur-2xl" />
      <div className="relative aspect-[4/5] overflow-hidden rounded-[26px] border border-white/10 bg-[#030404] shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:aspect-[9/16] sm:rounded-[32px]">
        <SpydaMotionReel />
      </div>
    </div>
  )
}

/* ── Hero ribbon: small, real pieces of the Spyda workspace ── */

function RibbonFlyer({ src, label }: { src: string; label?: string }) {
  return (
    <div className="relative h-[176px] w-[140px] overflow-hidden rounded-[18px] border border-white/25 bg-[#0b1412] shadow-[0_24px_50px_rgba(2,25,24,0.45)]">
      <img src={`/assets/${src}`} alt="" className="h-full w-full object-cover" loading="lazy" />
      {label && (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[9px] font-bold text-primary backdrop-blur-sm">
          <ShieldCheck className="h-2.5 w-2.5" /> {label}
        </span>
      )}
    </div>
  )
}

function RibbonCard({ children, tone = 'light', className = '' }: { children: React.ReactNode; tone?: 'light' | 'dark' | 'mint'; className?: string }) {
  const tones = {
    light: 'border-white/70 bg-[#f4f8f5] text-[#0b1210]',
    dark: 'border-white/15 bg-[#07100f] text-white',
    mint: 'border-white/40 bg-primary text-primary-foreground',
  }
  return (
    <div className={`w-[168px] rounded-[18px] border p-3.5 text-left shadow-[0_24px_50px_rgba(2,25,24,0.4)] ${tones[tone]} ${className}`}>
      {children}
    </div>
  )
}

const ribbon: React.ReactNode[] = [
  <RibbonFlyer key="f1" src="spyda-sample-02.jpeg" />,
  <RibbonCard key="atom">
    <p className="flex items-center gap-1.5 text-[10px] font-semibold"><Type className="h-3 w-3 text-[#16a34a]" /> Headline</p>
    <div className="mt-2 flex overflow-hidden rounded-full border border-black/10 text-[9px] font-semibold">
      <span className="flex-1 px-2 py-1 text-center text-black/40">Same</span>
      <span className="flex-1 bg-[#0b1210] px-2 py-1 text-center text-primary">Customize</span>
    </div>
    <p className="mt-2 rounded-lg bg-black/[0.05] px-2 py-1.5 text-[10px] font-medium leading-4">Grand Opening — This Saturday</p>
  </RibbonCard>,
  <div key="source" className="relative h-[196px] w-[156px] overflow-hidden rounded-[18px] border border-white/25 shadow-[0_24px_50px_rgba(2,25,24,0.45)]">
    <img src="/assets/spyda-sample-04.jpeg" alt="" className="h-full w-full object-cover object-top" loading="lazy" />
    <div className="absolute left-[8%] top-[7%] h-[16%] w-[84%] rounded-sm border border-dashed border-primary bg-primary/10"><span className="rounded-br-sm bg-primary px-1 text-[7px] font-bold text-primary-foreground">Headline</span></div>
    <div className="absolute left-[22%] top-[36%] h-[32%] w-[56%] rounded-sm border border-dashed border-[#8bd3ff] bg-[#8bd3ff]/10"><span className="rounded-br-sm bg-[#8bd3ff] px-1 text-[7px] font-bold text-[#06202e]">Product photo</span></div>
  </div>,
  <RibbonCard key="atoms" tone="dark" className="w-[196px]">
    <p className="font-heading text-[13px] font-semibold">Design Atoms</p>
    <p className="mt-0.5 text-[9px] text-white/55">6 components detected</p>
    <div className="mt-3 space-y-1.5">
      {[['Headline', 'Customize'], ['Product Photo', 'Customize'], ['Brand Logo', 'Same']].map(([name, mode]) => (
        <div key={name} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[9px]">
          <span className="font-medium">{name}</span>
          <span className={mode === 'Customize' ? 'font-bold text-primary' : 'text-white/45'}>{mode}</span>
        </div>
      ))}
    </div>
    <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[9px] font-bold text-primary-foreground"><Zap className="h-2.5 w-2.5" /> Apply 3/3</span>
  </RibbonCard>,
  <RibbonFlyer key="child" src="spyda-sample-07.jpeg" label="QA 98/100 · Round 2" />,
  <RibbonCard key="brand">
    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#16a34a]">Brand Constants</p>
    <div className="mt-2.5 flex gap-1.5">
      {['#0F172A', '#22C55E', '#F8FAFC'].map(hex => <span key={hex} className="h-6 w-6 rounded-full border border-black/15" style={{ backgroundColor: hex }} />)}
    </div>
    <p className="mt-2.5 text-[10px] font-medium leading-4">Space Grotesk / Montserrat</p>
  </RibbonCard>,
  <RibbonCard key="changes" tone="mint">
    <p className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-70">Child Source</p>
    <p className="mt-1.5 font-heading text-2xl font-semibold">3/3</p>
    <p className="text-[10px] font-medium">changes ready</p>
    <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-[#050606] px-2.5 py-1 text-[9px] font-bold text-primary"><Download className="h-2.5 w-2.5" /> Download</span>
  </RibbonCard>,
  <RibbonCard key="motion" tone="dark">
    <p className="flex items-center gap-1.5 text-[9px] text-white/55"><Clapperboard className="h-3 w-3 text-primary" /> Claude Opus 5.5</p>
    <p className="mt-2 font-heading text-lg font-semibold leading-tight">Motion design</p>
    <p className="text-[10px] text-white/60">9:16 · 8s · ready to post</p>
  </RibbonCard>,
  <RibbonFlyer key="f2" src="spyda-sample-10.jpeg" />,
]

/**
 * A shallow arc: the middle card faces you, the outer ones turn in and shrink.
 * It is laid out once, never animated, so nothing on the page tilts on its own.
 */
function HeroRibbon() {
  const middle = (ribbon.length - 1) / 2
  return (
    <div aria-hidden="true" className="landing-enter landing-enter--late relative mt-14 flex select-none items-center justify-center gap-3 [perspective:1400px] sm:gap-4">
      {ribbon.map((card, index) => {
        const offset = index - middle
        const distance = Math.abs(offset)
        return (
          <div
            key={index}
            className={`shrink-0 ${distance > 2 ? 'hidden md:block' : ''}`}
            style={{
              transform: `rotateY(${-offset * 11}deg) scale(${1 - distance * 0.075})`,
              transformOrigin: offset < 0 ? 'right center' : offset > 0 ? 'left center' : 'center',
              zIndex: 10 - distance,
            }}
          >
            {card}
          </div>
        )
      })}
    </div>
  )
}

/* ── Cards ── */

/** A grid of cards dealt out like a deck when it scrolls into view (see useCardDeck). */
function Deck({ className, children }: { className: string; children: React.ReactNode }) {
  const { ref } = useCardDeck()
  return <div ref={ref} className={className}>{children}</div>
}

const FEATURES: { id: string; tone?: CardTone; icon: React.ElementType; title: string; desc: string }[] = [
  { id: 'chat', tone: 'mint', icon: MessageSquareText, title: 'A chat that makes it yours', desc: 'Say it in plain words. You see the cost before anything runs.' },
  { id: 'motion', icon: Clapperboard, title: 'Motion by Claude Opus 5.5', desc: 'Animate any design for posts, stories and reels.' },
  { id: 'voice', icon: Mic, title: 'Talk instead of type', desc: 'Tap the mic and describe the change.' },
  { id: 'canvas', icon: Layers3, title: 'Canvas mode and Magic Layers', desc: 'Split a flat flyer into live layers and edit each one.' },
  { id: 'video', icon: Play, title: 'A pro video editor', desc: 'Cut, colour, add music and titles, export MP4.' },
  { id: 'compress', icon: Download, title: 'Smaller downloads', desc: 'Files up to 90% smaller, same look.' },
  { id: 'brand', tone: 'light', icon: Palette, title: 'Brand constants', desc: 'Your fonts and colours on every version.' },
  { id: 'workspace', icon: Library, title: 'A reusable workspace', desc: 'Chats, projects and assets, ready when you return.' },
]

/** The feature cards, with a Shuffle button that gathers and re-deals them. */
function FeatureDeck() {
  const { ref, shuffle } = useCardDeck()
  const [order, setOrder] = useState(FEATURES)
  const reshuffle = () => void shuffle(() => setOrder(current => {
    const next = [...current]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const held = next[i]
      next[i] = next[j]
      next[j] = held
    }
    return next
  }))
  return (
    <>
      <div ref={ref} className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {order.map(item => <FeatureCard key={item.id} tone={item.tone} icon={item.icon} title={item.title} desc={item.desc} />)}
      </div>
      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={reshuffle}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-white/[0.12] bg-surface px-5 font-heading text-[11px] font-semibold uppercase tracking-[0.14em] transition-all hover:-translate-y-0.5 hover:bg-surface-raised active:translate-y-0 active:scale-[0.98]"
        >
          <RefreshCw className="h-3.5 w-3.5 text-primary" /> Shuffle the deck
        </button>
      </div>
    </>
  )
}

type CardTone = 'surface' | 'mint' | 'light'

const CARD_TONES: Record<CardTone, { card: string; icon: string; body: string }> = {
  surface: {
    card: 'border-white/[0.07] bg-surface text-foreground hover:border-primary/30',
    icon: 'border-primary/25 bg-primary/10 text-primary',
    body: 'text-muted-foreground',
  },
  mint: {
    card: 'border-primary bg-primary text-primary-foreground',
    icon: 'border-black/10 bg-[#050606] text-primary',
    body: 'text-primary-foreground/75',
  },
  light: {
    card: 'border-white bg-[#eef3ef] text-[#0b1210]',
    icon: 'border-black/10 bg-[#0b1210] text-primary',
    body: 'text-[#0b1210]/65',
  },
}

function FeatureCard({ icon: Icon, title, desc, tone = 'surface' }: { icon: React.ElementType; title: string; desc: string; tone?: CardTone }) {
  const style = CARD_TONES[tone]
  return (
    <article className={`group relative flex min-h-[230px] flex-col overflow-hidden rounded-[26px] border p-7 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(0,0,0,0.4)] ${style.card}`}>
      <span className={`flex h-12 w-12 items-center justify-center rounded-full border transition-transform duration-300 group-hover:scale-105 ${style.icon}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <h3 className="mt-auto pt-10 font-heading text-xl font-semibold">{title}</h3>
      <p className={`mt-2 text-sm leading-6 ${style.body}`}>{desc}</p>
    </article>
  )
}

function PricingCard({ name, price, detail, desc, features, featured, texture, cta }: {
  cta?: string
  name: string
  price: string
  detail: string
  desc: string
  features: string[]
  featured?: boolean
  texture: 'free' | 'starter' | 'creator' | 'pro'
}) {
  return (
    <article tabIndex={0} aria-label={`${name} pricing`} className={`pricing-texture pricing-texture--${texture} relative flex w-[84vw] max-w-[340px] shrink-0 snap-start flex-col rounded-[26px] border p-7 outline-none md:w-auto md:max-w-none ${featured ? 'border-primary/50 bg-surface-raised shadow-[0_0_0_1px_rgba(157,250,176,0.12),0_24px_60px_rgba(157,250,176,0.07)]' : 'border-white/[0.07] bg-surface'}`}>
      {featured && <span className="absolute right-5 top-5 rounded-full bg-primary px-2.5 py-1 font-heading text-[9px] font-semibold uppercase tracking-[0.14em] text-primary-foreground">Start here</span>}
      <h3 className="font-heading text-lg font-semibold">{name}</h3>
      <p className="mt-4 font-heading text-3xl font-semibold">{price}</p>
      <p className="mt-1 text-xs text-primary">{detail}</p>
      <p className="mt-4 min-h-12 text-sm leading-6 text-muted-foreground">{desc}</p>
      <ul className="mt-5 flex-1 space-y-3 border-t border-white/[0.07] pt-5">
        {features.map(feature => (
          <li key={feature} className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.4} />
            {feature}
          </li>
        ))}
      </ul>
      <Link to="/auth" className={`mt-6 inline-flex h-11 items-center justify-center rounded-full font-heading text-[12px] font-semibold uppercase tracking-[0.12em] transition-all active:scale-[0.98] ${featured ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-white/[0.1] bg-surface-raised hover:bg-white/[0.07]'}`}>
        {cta ?? `Choose ${name}`}
      </Link>
    </article>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className={`faq-card rounded-[20px] border transition-colors ${isOpen ? 'faq-card--open border-transparent bg-surface-raised' : 'border-white/[0.07] bg-surface hover:border-white/[0.14]'}`}>
      <button type="button" onClick={() => setIsOpen(previous => !previous)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left">
        <span className="font-heading text-base font-medium text-foreground">{question}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${isOpen ? 'rotate-180 bg-primary text-primary-foreground' : 'bg-white/[0.06] text-muted-foreground'}`}>
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden"><p className="max-w-2xl px-6 pb-6 text-sm leading-6 text-muted-foreground">{answer}</p></div>
      </div>
    </div>
  )
}

const samples = [
  'spyda-sample-01.jpeg', 'spyda-sample-02.jpeg', 'spyda-sample-03.jpeg',
  'spyda-sample-04.jpeg', 'spyda-sample-05.jpeg', 'spyda-sample-06.jpeg',
  'spyda-sample-07.jpeg', 'spyda-sample-08.jpeg', 'spyda-sample-09.jpeg',
  'spyda-sample-10.jpeg', 'spyda-sample-11.jpeg', 'spyda-sample-12.jpeg',
]

const navLinks = [
  ['#problem', 'Why Spyda'],
  ['#how', 'How it works'],
  ['#features', 'What you control'],
  ['#motion', 'Motion'],
  ['#economy', 'Spyda Token'],
  ['#pricing', 'Pricing'],
]

const problems = [
  ['Rebuilding takes too long', 'Small revisions turn into hours of work.'],
  ['One large AI prompt changes too much', 'The layout drifts and details get lost.'],
  ['Good references lose their structure', 'Most AI tools treat your layout as a loose idea.'],
]

export default function Landing() {
  const [installPrompt, setInstallPrompt] = useState(getInstallPrompt)
  const [installHint, setInstallHint] = useState<string | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
    setIsInstalled(standalone)

    // The prompt event is captured at app boot (see lib/pwa-install), so it is
    // available even when Chrome fired it while the splash screen was showing.
    const syncPrompt = () => setInstallPrompt(getInstallPrompt())
    const markInstalled = () => {
      setInstallPrompt(null)
      setInstallHint(null)
      setIsInstalled(true)
    }

    window.addEventListener(INSTALL_AVAILABLE_EVENT, syncPrompt)
    window.addEventListener(INSTALL_COMPLETED_EVENT, markInstalled)
    return () => {
      window.removeEventListener(INSTALL_AVAILABLE_EVENT, syncPrompt)
      window.removeEventListener(INSTALL_COMPLETED_EVENT, markInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (installPrompt) {
      try {
        await installPrompt.prompt()
        await installPrompt.userChoice
        setInstallPrompt(null)
        clearInstallPrompt()
        return
      } catch {
        setInstallPrompt(null)
        clearInstallPrompt()
      }
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setInstallHint(isIos
      ? 'In Safari, tap the Share button, choose Add to Home Screen, then confirm Add.'
      : 'Open your browser menu and choose Install app or Add to Home screen. In Chrome, you may also see an install icon beside the address bar.')
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background font-sans text-foreground">
      <main>
        {/* Hero: one rounded panel holding the nav, the promise and the ribbon. */}
        <section className="p-2 sm:p-3">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 sm:rounded-[34px]">
            <HeroField variant="vivid" className="inset-0" />

            <header className="relative z-20 flex h-16 items-center justify-between px-4 sm:h-20 sm:px-7">
              <Link to="/" className="flex items-center gap-2.5" aria-label="Spyda home">
                <BrandMark size={32} animated />
                <span className="font-heading text-lg font-semibold text-white">Spyda</span>
              </Link>
              <nav className="hidden items-center gap-7 lg:flex" aria-label="Sections">
                {navLinks.map(([href, label]) => (
                  <a key={href} href={href} className="relative font-heading text-[11px] font-medium uppercase tracking-[0.16em] text-white/80 transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-white after:transition-transform hover:text-white hover:after:scale-x-100">
                    {label}
                  </a>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                {!isInstalled && (
                  <button
                    type="button"
                    onClick={handleInstall}
                    title="Install Spyda"
                    aria-label="Install Spyda"
                    className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full border border-white/20 bg-[#04161a]/45 text-white/85 backdrop-blur-md transition-colors hover:bg-[#04161a]/70 hover:text-white xl:w-auto xl:px-4"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden font-heading text-[11px] font-semibold uppercase tracking-[0.14em] xl:inline">Install Spyda</span>
                  </button>
                )}
                <Link to="/auth" className="hidden h-10 items-center px-3 font-heading text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 transition-colors hover:text-white sm:inline-flex">Sign in</Link>
                <Link to="/auth" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 font-heading text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] sm:px-5">
                  Open Spyda
                </Link>
              </div>
            </header>

            <div className="relative z-10 px-4 pb-10 pt-10 text-center sm:pb-12 sm:pt-14">
              <div className="landing-enter mx-auto max-w-5xl">
                <h1 className="font-heading text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.02em] text-white sm:text-6xl lg:text-[4.4rem]">
                  Keep the design you like.
                  <br />
                  <span className="text-[#c9ffd8]/90">Change only what you need.</span>
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-7 text-white/80 sm:text-base">
                  Import a design, say what to change, and Spyda makes it yours. Animate it, edit every layer, or cut it into a video. Free to use: pay only when you download.
                </p>
                <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <SecondaryPill href="#how"><Play className="h-3.5 w-3.5 text-primary" /> See the workflow</SecondaryPill>
                  <PrimaryPill to="/auth">Open Spyda</PrimaryPill>
                </div>
              </div>

              <HeroRibbon />

              <div className="landing-enter landing-enter--late mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12px] text-white/80">
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> No blank canvas</span>
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Focused 1-3 change rounds</span>
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Original stays untouched</span>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden py-9">
          <p className="mb-5 text-center font-heading text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">Made for the design work already on your desk</p>
          <div className="partners-marquee text-muted-foreground/70">
            {[0, 1].map(loop => (
              <div key={loop} className="partners-marquee__track">
                {[
                  [ImageIcon, 'Social media flyers'],
                  [Layers3, 'Campaign posters'],
                  [Zap, 'Product launches'],
                  [Gift, 'Event promotions'],
                  [Bot, 'App announcements'],
                  [Clapperboard, 'Motion videos'],
                  [RefreshCw, 'Client revisions'],
                ].map(([Icon, label]) => {
                  const MarqueeIcon = Icon as React.ElementType
                  return (
                    <span key={`${String(label)}-${loop}`} className="flex items-center gap-2.5 whitespace-nowrap font-heading text-[15px] font-semibold">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.07]"><MarqueeIcon className="h-3.5 w-3.5" /></span>
                      {String(label)}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </section>

        <section id="problem" className="px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-4xl text-center">
              <Eyebrow>The real design problem</Eyebrow>
              <h2 className="font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl lg:text-[3.6rem]">
                You do not need <HeadlineChip icon={Layers3} tone="sky" /> another
                <br />
                <span className="text-muted-foreground"><HeadlineChip icon={WandSparkles} tone="mint" /> blank canvas.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground">You already have the look. Rebuilding it to change a headline or logo is the slow part.</p>
            </div>

            <Deck className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Photo card with its stat card laid over it */}
              <article className="group relative min-h-[420px] overflow-hidden rounded-[28px] border border-white/10 md:row-span-2">
                <img src="/assets/spyda-sample-05.jpeg" alt="A detailed flyer reference" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />
                <span className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0b1210]"><Clock className="h-4 w-4" /></span>
                <div className="absolute inset-x-4 bottom-4 rounded-[20px] bg-[#f4f8f5] p-5 text-[#0b1210]">
                  <p className="font-heading text-5xl font-semibold tracking-[-0.03em]">01</p>
                  <h3 className="mt-3 font-heading text-base font-semibold">{problems[0][0]}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#0b1210]/65">{problems[0][1]}</p>
                </div>
              </article>

              <article className="flex min-h-[420px] flex-col rounded-[28px] border border-white/[0.07] bg-surface-raised p-7 md:row-span-2">
                <p className="text-sm text-muted-foreground">One prompt, every change at once</p>
                <p className="mt-3 font-heading text-5xl font-semibold tracking-[-0.03em]">02</p>
                <div className="mt-auto flex -space-x-3 pt-10">
                  {['spyda-sample-08.jpeg', 'spyda-sample-09.jpeg', 'spyda-sample-11.jpeg', 'spyda-sample-12.jpeg'].map(src => (
                    <img key={src} src={`/assets/${src}`} alt="" className="h-11 w-11 rounded-full border-2 border-surface-raised object-cover" loading="lazy" />
                  ))}
                </div>
                <h3 className="mt-5 font-heading text-lg font-semibold">{problems[1][0]}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{problems[1][1]}</p>
              </article>

              <article className="flex min-h-[220px] flex-col rounded-[28px] border border-primary bg-primary p-7 text-primary-foreground">
                <p className="font-heading text-5xl font-semibold tracking-[-0.03em]">03</p>
                <h3 className="mt-auto pt-6 font-heading text-lg font-semibold">{problems[2][0]}</h3>
                <p className="mt-2 text-sm leading-6 text-primary-foreground/75">{problems[2][1]}</p>
              </article>

              <article className="flex min-h-[184px] items-end justify-between gap-6 rounded-[28px] border border-white/[0.08] bg-black p-7">
                <p className="max-w-[12rem] text-sm leading-6 text-muted-foreground">Spyda fixes it with focused change rounds</p>
                <p className="font-heading text-5xl font-semibold tracking-[-0.03em] text-primary">1-3</p>
              </article>
            </Deck>
          </div>
        </section>

        <section id="how" className="px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-4xl text-center">
              <Eyebrow>How Spyda works</Eyebrow>
              <h2 className="font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">
                A clearer way <HeadlineChip icon={RefreshCw} tone="mint" /> to revise a design.
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">Import, ask, then fine-tune.</p>
            </div>
            <Deck className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Upload, step: '01', title: 'Import the reference', copy: 'The design whose look you want to keep.' },
                { icon: MessageSquareText, step: '02', title: 'Say what to change', copy: 'Type or talk: brand, headline, offer, photo.' },
                { icon: WandSparkles, step: '03', title: 'Get your version', copy: 'Confirm it, or switch to Motion to animate it.' },
                { icon: SlidersHorizontal, step: '04', title: 'Fine-tune in canvas mode', copy: 'Move, restyle and rewrite every layer.' },
              ].map(item => (
                <article key={item.step} className="group flex min-h-64 flex-col rounded-[26px] border border-white/[0.07] bg-surface p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30">
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary"><item.icon className="h-5 w-5" strokeWidth={1.8} /></span>
                    <span className="font-heading text-3xl font-semibold text-white/15">{item.step}</span>
                  </div>
                  <h3 className="mt-auto pt-10 font-heading text-lg font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.copy}</p>
                </article>
              ))}
            </Deck>
            <WorkspaceMockup />
          </div>
        </section>

        <section id="features" className="px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>What you control</Eyebrow>
              <h2 className="font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">
                Enough control to stay faithful.
                <br />
                <span className="text-muted-foreground">Enough AI <HeadlineChip icon={WandSparkles} tone="peach" /> to move faster.</span>
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">Every part of the design gets its own control.</p>
            </div>
            <FeatureDeck />
          </div>
        </section>

        <section id="motion" className="px-4 py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
            <div>
              <p className="mb-6 flex items-center gap-2 font-heading text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"><Clapperboard className="h-4 w-4" /> Motion design</p>
              <h2 className="max-w-2xl font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">
                Your flyer, <HeadlineChip icon={Play} tone="mint" /> now in motion.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">Describe the feel. Claude Opus 5.5 animates it in your colours and words.</p>
              <Deck className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  ['Every format', '4:5 posts, 9:16 reels, 1:1 squares.'],
                  ['Ready to post', 'Download a video or an HTML file.'],
                  ['Revise by asking', '“Slower, and end on the logo.”'],
                  ['Rewards included', '50 credits a video, earning SPYDA.'],
                ].map(([title, copy]) => (
                  <div key={title} className="rounded-[20px] border border-white/[0.07] bg-surface p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25">
                    <h3 className="font-heading text-base font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{copy}</p>
                  </div>
                ))}
              </Deck>
              <PrimaryPill to="/auth" className="mt-8">Animate a design</PrimaryPill>
            </div>
            <MotionPreview />
          </div>
        </section>

        <section id="samples" className="overflow-hidden py-20 sm:py-24">
          <div className="mb-12 px-4 text-center">
            <Eyebrow>Bring your reference</Eyebrow>
            <h2 className="mx-auto max-w-3xl font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">Your next design can start from work this detailed.</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">Start from a strong reference and make it yours.</p>
          </div>
          <div className="relative overflow-hidden">
            <div className="flex w-max gap-4 animate-marquee">
              {[...samples, ...samples].map((source, index) => (
                <img key={`${source}-${index}`} src={`/assets/${source}`} alt="Flyer reference example" className="aspect-[4/5] w-[220px] rounded-[22px] border border-white/[0.08] object-cover shadow-[0_18px_45px_rgba(0,0,0,0.3)] sm:w-[260px]" loading="lazy" />
              ))}
            </div>
          </div>
        </section>

        <section id="economy" className="px-2 py-8 sm:px-3">
          <div className="relative mx-auto overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#070909] px-5 py-16 sm:rounded-[34px] sm:px-8 sm:py-20">
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#9dfab0,#88a8ff,transparent)]" />
            <div className="relative mx-auto max-w-6xl">
              <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.82fr)] lg:gap-16">
                <div>
                  <p className="mb-6 flex items-center gap-2 font-heading text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"><Coins className="h-4 w-4" /> The Spyda economy</p>
                  <h2 className="max-w-3xl font-heading text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">Your design budget should create more than the next design.</h2>
                  <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">Credits you use on Spyda earn SPYDA rewards. The earlier you join, the more each credit earns.</p>

                  <div className="mt-8 rounded-[24px] border border-primary/25 bg-[linear-gradient(150deg,rgba(157,250,176,0.08),rgba(255,255,255,0.01))] p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Early-adopter rate</p>
                    <div className="mt-3 flex items-center gap-3">
                      <img src="/assets/spyda-credit.png" alt="" className="h-9 w-9 object-contain" />
                      <p className="font-heading text-4xl font-semibold tracking-[-0.02em]">10,000 SPYDA</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">for every 1,000 credits used by the first 1,000 users.</p>
                  </div>

                  <ol className="mt-8 grid gap-6 sm:grid-cols-3">
                    {[
                      ['Create', 'Use credits on real design work.'],
                      ['Accrue', 'Rewards follow credits used, not deposits.'],
                      ['Launch', 'When users earn 1 billion SPYDA together.'],
                    ].map(([title, copy], index) => (
                      <li key={title} className="border-t border-white/[0.1] pt-4">
                        <p className="font-heading text-xs font-semibold text-primary">0{index + 1}</p>
                        <h3 className="mt-2 text-sm font-semibold">{title}</h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <PrimaryPill to="/auth">Start creating and accruing</PrimaryPill>
                    <Link to="/auth" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-surface px-6 whitespace-nowrap font-heading text-[12px] font-semibold uppercase tracking-[0.14em] transition-all hover:-translate-y-0.5 hover:bg-surface-raised active:translate-y-0 active:scale-[0.98]"><ShieldCheck className="h-4 w-4 text-primary" /> Read the whitepaper</Link>
                  </div>
                  <p className="mt-6 max-w-xl text-[11px] leading-5 text-muted-foreground/80">Pre-launch SPYDA is a non-transferable reward record, not cash or a guaranteed value. Launch also needs security and legal readiness.</p>
                </div>

                <SpydaCoin />
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">Free to use. Pay only when you download.</h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">No subscription, ever. Credits only for downloads and AI, from $1.</p>
            </div>
            <Deck className="mx-auto mt-12 flex max-w-7xl snap-x snap-mandatory gap-4 overflow-x-auto px-[8vw] pb-3 pt-2 md:mt-14 md:grid md:pt-0 md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-4">
              <PricingCard name="Spyda" price="Free" detail="Always. No subscription." desc="Every editor and tool, as much as you like." features={['Spyda AI chat and voice', 'Canvas mode flyer editor and Magic Layers', 'Video editor with effects and transitions', 'Templates and the marketplace']} texture="free" cta="Start free" />
              <PricingCard name="Recharge" price="From $1" detail="$1 = 1,000 Spyda credits" desc="Top up any amount, any time." features={['Recharge any amount from $1', 'Credits never expire', 'No recurring payment, ever', 'Paid securely through Paystack']} texture="starter" featured cta="Recharge" />
              <PricingCard name="Downloads" price="100 credits" detail="per flyer or video" desc="Pay once your file is ready to save." features={['Compressor: +50 credits', 'Up to 90% smaller, same quality', 'Charged only when the file is ready', 'Eligible spend accrues SPYDA']} texture="creator" cta="Start designing" />
              <PricingCard name="AI work" price="From 5 credits" detail="per generation" desc="The cost is confirmed before it runs." features={['20 credits: Groq + GPT-Image 2', '30 credits: GPT-Image 2 only', '50 credits: motion by Claude Opus 5.5', '5 credits with your own API key']} texture="pro" cta="Try Spyda AI" />
            </Deck>
            <p className="mt-5 text-center text-xs text-muted-foreground">Payments are handled securely through Paystack.</p>
          </div>
        </section>

        <section id="faq" className="px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <Eyebrow>Questions</Eyebrow>
              <h2 className="font-heading text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-4xl">Know what to expect before you upload.</h2>
            </div>
            <div className="mt-12 space-y-3">
              <FAQItem question="What does Spyda actually do?" answer="It turns a design you like into your own. Import a flyer, say what to change by typing or talking, and Spyda makes your version while keeping the look. You can animate it with Claude Opus 5.5 or edit every layer by hand." />
              <FAQItem question="Is Spyda free?" answer="Yes, and it always will be: no subscription, now or later. You spend Spyda credits only to download your work or run AI. A $1 recharge adds 1,000 credits." />
              <FAQItem question="What does a download cost?" answer="100 credits for a flyer, animation or video. The compressor adds 50 and makes the file up to 90% smaller at the same quality; if it cannot shrink the file, it is free. Credits are taken only once your file is ready." />
              <FAQItem question="Can I edit designs and videos by hand?" answer="Yes. Canvas mode splits a flat flyer into live text, subject, logos and background for you to edit, and the video studio cuts, colours and mixes clips into an MP4 with sound." />
              <FAQItem question="How do SPYDA rewards work?" answer="You earn SPYDA as you spend credits on downloads and AI. The rate depends on when you joined: the first 1,000 users earn 10,000 SPYDA per 1,000 credits, and later users earn less, down to 1. Adding money to your wallet alone earns nothing." />
              <FAQItem question="Is SPYDA the same as cash?" answer="No. Before launch, SPYDA is a non-transferable reward record, not cash, a refund or a promise of a market price. The token launches when users have earned 1 billion SPYDA together and security and legal checks are done." />
            </div>
          </div>
        </section>

        <section className="px-2 pb-8 sm:px-3">
          <div className="relative mx-auto overflow-hidden rounded-[28px] bg-primary px-6 py-16 text-center text-primary-foreground sm:rounded-[34px] sm:px-12 sm:py-20">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[#8bd3ff]/50 blur-3xl" />
            <div className="relative">
              <h2 className="mx-auto max-w-3xl font-heading text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-6xl">Stop rebuilding good designs from zero.</h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-primary-foreground/75">Bring the reference, choose the changes, keep the look.</p>
              <Link to="/auth" className="group mt-9 inline-flex h-12 items-center gap-3 rounded-full bg-[#050606] pl-6 pr-1.5 whitespace-nowrap font-heading text-[12px] font-semibold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]">
                Try Spyda with your flyer
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-200 group-hover:rotate-45"><ArrowUpRight className="h-4 w-4" /></span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {installHint && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" role="presentation" onClick={() => setInstallHint(null)}>
          <div className="w-full max-w-md rounded-[24px] border glass glass-strong p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]" role="dialog" aria-modal="true" aria-labelledby="install-spyda-title" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src="/assets/spyda-icon-192.png" alt="" className="h-11 w-11 object-contain" />
                <div>
                  <h2 id="install-spyda-title" className="font-heading text-base font-semibold">Install Spyda</h2>
                  <p className="mt-0.5 text-xs text-primary">Open as a full-screen app</p>
                </div>
              </div>
              <button type="button" onClick={() => setInstallHint(null)} aria-label="Close install instructions" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">{installHint}</p>
            <button type="button" onClick={() => setInstallHint(null)} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90">Got it</button>
          </div>
        </div>
      )}

      <footer className="px-4 py-9">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5"><BrandMark size={28} className="opacity-70" /><span className="font-heading text-sm font-semibold">Spyda</span><span className="text-xs text-muted-foreground">&copy; 2026</span></div>
          <p className="text-xs text-muted-foreground">Premium design today. Participation in what comes next.</p>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.09] bg-surface px-3.5 py-2 text-[10px] text-muted-foreground">
            <span>Built by</span><img src="/assets/vigency-logo-footer.png" alt="Vigency" className="h-4 w-auto opacity-70" />
          </div>
        </div>
      </footer>
    </div>
  )
}
