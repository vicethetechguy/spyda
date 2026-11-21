import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
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
  GraduationCap,
  Image as ImageIcon,
  Layers3,
  LayoutDashboard,
  Library,
  MessageSquareText,
  Mic,
  Network,
  Palette,
  PanelLeftClose,
  Play,
  RefreshCw,
  ScanSearch,
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
} from 'lucide-react'

import {
  INSTALL_AVAILABLE_EVENT,
  INSTALL_COMPLETED_EVENT,
  clearInstallPrompt,
  getInstallPrompt,
} from '../lib/pwa-install'
import BrandMark from '../components/brand/BrandMark'
import HeroField from '../components/HeroField'
import SpydaCoin from '../components/SpydaCoin'

/* ── Hero mockup: a faithful miniature of the real Spyda workspace ── */

function MockNavItem({ icon: Icon, label, active }: { icon: React.ElementType; label: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-[5px] px-2 py-[5px] text-[10px] ${active ? 'border-l-2 border-primary bg-primary/5 font-semibold text-primary' : 'text-muted-foreground'}`}>
      <Icon className={`h-3 w-3 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground/70'}`} strokeWidth={1.5} />
      <span className="truncate">{label}</span>
    </div>
  )
}

function MockNavHeading({ children }: { children: React.ReactNode }) {
  return <span className="px-2 pb-0.5 pt-2.5 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/50">{children}</span>
}

function MockAtomCard({ icon: Icon, name, type, mode, detail }: {
  icon: React.ElementType
  name: string
  type: string
  mode: 'same' | 'customize'
  detail?: string
}) {
  return (
    <div className={`rounded-lg border p-2.5 ${mode === 'customize' ? 'border-primary/25 bg-primary/[0.04]' : 'border-white/[0.06] bg-surface'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-surface-raised"><Icon className="h-2.5 w-2.5 text-primary" strokeWidth={1.7} /></span>
          <span className="truncate text-[10px] font-semibold text-foreground">{name}</span>
          <span className="shrink-0 rounded-sm bg-white/[0.05] px-1 py-0.5 text-[7px] font-bold uppercase tracking-wide text-muted-foreground">{type}</span>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-white/[0.08] text-[8px] font-semibold">
          <span className={`px-1.5 py-0.5 ${mode === 'same' ? 'bg-white/[0.08] text-foreground' : 'text-muted-foreground/60'}`}>Same</span>
          <span className={`px-1.5 py-0.5 ${mode === 'customize' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground/60'}`}>Customize</span>
        </div>
      </div>
      {detail && (
        <p className="mt-1.5 flex items-center gap-1 truncate rounded-md border border-white/[0.06] bg-black/30 px-2 py-1 text-[9px] text-foreground/80">
          {mode === 'customize' && <Check className="h-2.5 w-2.5 shrink-0 text-primary" strokeWidth={2.6} />}{detail}
        </p>
      )}
    </div>
  )
}

function WorkspaceMockup() {
  return (
    <div className="relative mx-auto mt-4 overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#08090a] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
      <div className="flex h-9 items-center justify-between border-b border-white/[0.07] px-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Spyda design workspace</div>
        <span>Reference to child design</span>
      </div>

      <div className="flex h-[400px] select-none sm:h-[460px]" aria-hidden="true">
        {/* Sidebar */}
        <div className="hidden w-44 shrink-0 flex-col border-r border-white/[0.06] bg-[#060608]/90 p-2.5 md:flex">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-1.5 py-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#22c55e] to-[#16a34a] font-heading text-[10px] font-bold text-white">S</div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium leading-none text-foreground">My Workspace</p>
              <p className="mt-0.5 text-[8px] leading-none text-muted-foreground">Design workspace</p>
            </div>
            <ChevronDown className="ml-auto h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
          </div>
          <div className="flex flex-col gap-0.5">
            <MockNavItem icon={LayoutDashboard} label="Canvas" active />
            <MockNavItem icon={ImageIcon} label="Gallery" />
            <MockNavItem icon={Clock} label="History" />
            <MockNavHeading>Workspace</MockNavHeading>
            <MockNavItem icon={FolderKanban} label="Projects" />
            <MockNavItem icon={Blocks} label="Templates" />
            <MockNavItem icon={Palette} label="Brand Assets" />
            <MockNavHeading>Documentation</MockNavHeading>
            <MockNavItem icon={BookOpen} label="Whitepaper" />
            <MockNavItem icon={GraduationCap} label="Guides" />
          </div>
          <div className="mt-auto flex flex-col gap-0.5 border-t border-white/[0.06] pt-2">
            <MockNavHeading>Account</MockNavHeading>
            <MockNavItem icon={Wallet} label="Wallet" />
            <MockNavItem icon={Settings} label="Settings" />
          </div>
        </div>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#060608]/80 px-3">
            <div className="flex items-center gap-2 text-[10px]">
              <PanelLeftClose className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
              <span className="hidden text-muted-foreground sm:inline">My Workspace</span>
              <span className="hidden text-muted-foreground/30 sm:inline">/</span>
              <span className="font-semibold text-foreground">Canvas</span>
              <ShieldCheck className="h-3 w-3 text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 items-center gap-1.5 rounded-md border border-white/[0.08] bg-surface-raised px-2 text-[9px] font-medium text-muted-foreground">
                <Bot className="h-2.5 w-2.5 text-primary" /> Groq + GPT-Image 2 <ChevronDown className="h-2 w-2" />
              </span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-[8px] font-bold text-primary-foreground">S</span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Source + Child Source */}
            <div className="flex min-h-0 w-full flex-col border-r border-white/[0.06] p-3 sm:w-[46%]">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-primary">Source</span>
                  <span className="text-[8px] text-muted-foreground/50">launch-flyer.jpeg</span>
                </div>
                <span className="text-[8px] text-muted-foreground">Change</span>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.06]">
                <img src="/assets/spyda-sample-04.jpeg" alt="" className="h-full w-full object-cover object-top" loading="lazy" />
                {/* Layout grid overlay */}
                <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.14)_1px,transparent_1px)] [background-size:12.5%_12.5%]" />
                {/* Detected atom boxes */}
                <div className="absolute left-[8%] top-[7%] flex h-[16%] w-[84%] items-start rounded-sm border border-dashed border-primary/70 bg-primary/[0.06]"><span className="rounded-br-sm bg-primary px-1 py-px text-[7px] font-bold text-primary-foreground">Headline</span></div>
                <div className="absolute left-[22%] top-[34%] flex h-[34%] w-[56%] items-start rounded-sm border border-dashed border-[#8bd3ff]/70 bg-[#8bd3ff]/[0.06]"><span className="rounded-br-sm bg-[#8bd3ff] px-1 py-px text-[7px] font-bold text-[#06202e]">Product photo</span></div>
                <div className="absolute bottom-[6%] left-[26%] flex h-[10%] w-[48%] items-start rounded-sm border border-dashed border-[#ffab84]/70 bg-[#ffab84]/[0.08]"><span className="rounded-br-sm bg-[#ffab84] px-1 py-px text-[7px] font-bold text-[#3a1503]">Call to action</span></div>
                <span className="absolute bottom-1.5 left-1.5 rounded border border-white/10 bg-black/70 px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-white/75 backdrop-blur-sm">8 x 8 layout grid</span>
              </div>

              <div className="mb-1.5 mt-2.5 flex items-center justify-between">
                <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-primary">Child Source</span>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full border border-white/[0.08] bg-surface-raised px-1.5 py-0.5 text-[7px] font-bold text-muted-foreground">3/3 changes ready</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[7px] font-bold text-primary-foreground"><Download className="h-2 w-2" /> Download</span>
                </div>
              </div>
              <div className="relative h-[88px] shrink-0 overflow-hidden rounded-lg border border-primary/25 sm:h-[104px]">
                <img src="/assets/spyda-sample-04.jpeg" alt="" className="h-full w-full object-cover object-center" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded border border-primary/30 bg-black/75 px-1.5 py-0.5 text-[7px] font-bold text-primary backdrop-blur-sm"><ShieldCheck className="h-2 w-2" /> QA 98/100 · Round 2</span>
              </div>
            </div>

            {/* Design Atoms panel */}
            <div className="hidden min-h-0 min-w-0 flex-1 flex-col sm:flex">
              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <div>
                  <p className="text-[11px] font-semibold text-foreground">Design Atoms</p>
                  <p className="text-[8px] text-muted-foreground">6 components detected • Edit replacements below</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[9px] font-bold text-primary-foreground"><Zap className="h-2.5 w-2.5" /> Apply 3/3</span>
              </div>
              <div className="relative min-h-0 flex-1 space-y-2 overflow-hidden p-2.5">
                <div className="rounded-lg border border-white/[0.06] bg-surface p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-primary">Edit round — up to 3 focused changes</p>
                      <p className="mt-0.5 text-[8px] text-muted-foreground">2 atom changes + 1 Essential prompt. 0 slots left.</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold text-primary">3/3</span>
                  </div>
                </div>
                <MockAtomCard icon={Type} name="Headline" type="text" mode="customize" detail="Grand Opening — This Saturday" />
                <MockAtomCard icon={ImageIcon} name="Product Photo" type="image" mode="customize" detail="Replacement placed at exact size" />
                <MockAtomCard icon={Target} name="Brand Logo" type="logo" mode="same" />
                <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-primary">Brand Constants</span>
                    <span className="relative h-3.5 w-6 rounded-full border border-primary/70 bg-primary"><span className="absolute right-0.5 top-[2px] h-2 w-2 rounded-full bg-white" /></span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {['#0F172A', '#22C55E', '#F8FAFC'].map(hex => (
                      <span key={hex} className="flex items-center gap-1 rounded-md border border-white/[0.07] bg-surface-raised px-1.5 py-0.5">
                        <span className="h-2 w-2 rounded-full border border-white/20" style={{ backgroundColor: hex }} />
                        <span className="text-[7px] font-medium text-muted-foreground">{hex}</span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[8px] text-muted-foreground">Space Grotesk / Montserrat · Applied to every reconstruction</p>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#08090a] to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-white/[0.1] bg-black/75 px-3 py-2 text-[10px] text-white backdrop-blur-md">
        <ScanSearch className="h-3.5 w-3.5 text-primary" /> Source, atoms, and child version in one view
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
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[340px]">
      <div className="absolute -inset-6 rounded-[48px] bg-[radial-gradient(closest-side,rgba(18,134,111,0.45),transparent)] blur-2xl" />
      <div className="relative aspect-[9/16] overflow-hidden rounded-[34px] border border-white/15 bg-[#0b1412] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <img src="/assets/spyda-sample-07.jpeg" alt="" className="motion-preview-photo absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/25" />
        <div className="motion-preview-sweep absolute inset-y-0 -left-1/2 w-1/2 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.28),transparent)]" />
        <span className="motion-preview-chip absolute left-5 top-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 font-heading text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground"><Clapperboard className="h-3 w-3" /> Claude Opus 5.5</span>
        <span className="absolute right-4 top-6 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur"><Clapperboard className="h-3 w-3 text-primary" /> 0:08</span>
        <div className="absolute inset-x-5 bottom-3 h-1 overflow-hidden rounded-full bg-white/20"><div className="motion-preview-progress h-full bg-primary" /></div>
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

function PricingCard({ name, price, detail, desc, features, featured, texture }: {
  name: string
  price: string
  detail: string
  desc: string
  features: string[]
  featured?: boolean
  texture: 'free' | 'starter' | 'creator' | 'pro'
}) {
  return (
    <article tabIndex={0} aria-label={`${name} pricing plan`} className={`pricing-texture pricing-texture--${texture} relative flex w-[84vw] max-w-[340px] shrink-0 snap-start flex-col rounded-[26px] border p-7 outline-none md:w-auto md:max-w-none ${featured ? 'border-primary/50 bg-surface-raised shadow-[0_0_0_1px_rgba(157,250,176,0.12),0_24px_60px_rgba(157,250,176,0.07)]' : 'border-white/[0.07] bg-surface'}`}>
      {featured && <span className="absolute right-5 top-5 rounded-full bg-primary px-2.5 py-1 font-heading text-[9px] font-semibold uppercase tracking-[0.14em] text-primary-foreground">Popular</span>}
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
        Choose {name}
      </Link>
    </article>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className={`rounded-[20px] border transition-colors ${isOpen ? 'border-primary/30 bg-surface-raised' : 'border-white/[0.07] bg-surface hover:border-white/[0.14]'}`}>
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
  ['Rebuilding takes too long', 'A small client revision can turn into hours of recreating spacing, type, and visual balance.'],
  ['One large AI prompt changes too much', 'When every instruction is sent at once, the layout drifts and important details get lost.'],
  ['Good references lose their structure', 'Most generators treat your reference as inspiration instead of a layout that should remain recognizable.'],
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
                <BrandMark size={32} />
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
                  Upload a design you already like and tell Spyda what to change, by typing or by voice. ChatGPT makes it yours, Claude Opus 5.5 turns it into motion, and canvas mode lets you fine-tune every layer by hand.
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
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground">You already found the structure, hierarchy, and visual direction you want. The slow part is rebuilding it just to change a headline, product photo, logo, offer, or brand color.</p>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            </div>
          </div>
        </section>

        <section id="how" className="px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-4xl text-center">
              <Eyebrow>How Spyda works</Eyebrow>
              <h2 className="font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">
                A clearer way <HeadlineChip icon={RefreshCw} tone="mint" /> to revise a design.
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">Spyda turns a design you like into yours in a conversation, then lets you animate it or refine it by hand.</p>
            </div>
            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Upload, step: '01', title: 'Import the reference', copy: 'Start with the flyer, poster, or social design whose look you want to keep.' },
                { icon: MessageSquareText, step: '02', title: 'Say what to change', copy: 'Type or talk: your brand, headline, offer, contacts, colours or a new photo. Spyda asks for anything it needs.' },
                { icon: WandSparkles, step: '03', title: 'Get your version', copy: 'Confirm the change and ChatGPT generates your flyer, or switch to Motion and Claude Opus 5.5 animates it.' },
                { icon: SlidersHorizontal, step: '04', title: 'Fine-tune in canvas mode', copy: 'Open the result as layers to move, restyle and rewrite each part by hand, with every edit on a timeline.' },
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
            </div>
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
              <p className="mt-5 text-base leading-7 text-muted-foreground">Spyda keeps the reference visible and gives each important part of the design its own place to edit.</p>
            </div>
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard tone="mint" icon={MessageSquareText} title="A chat that makes it yours" desc="Tell Spyda what to change in plain words. It confirms the change and its credit cost before anything is generated." />
              <FeatureCard icon={Clapperboard} title="Motion by Claude Opus 5.5" desc="Turn any reference into a short animation for posts, stories and reels, then download it as a video." />
              <FeatureCard icon={Mic} title="Talk instead of type" desc="Tap the mic and describe the change. Your words land in the chat for you to send." />
              <FeatureCard icon={Layers3} title="Canvas mode" desc="Open a flyer as layers to drag, resize, rewrite and recolour each part, with undo and an edit timeline." />
              <FeatureCard tone="light" icon={Palette} title="Brand constants" desc="Keep your fonts, HEX colours and visual direction consistent across every version you make." />
              <FeatureCard icon={Library} title="A reusable workspace" desc="Return to your chats, projects, templates, brand assets and generated designs on this device." />
            </div>
          </div>
        </section>

        <section id="motion" className="px-4 py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
            <div>
              <p className="mb-6 flex items-center gap-2 font-heading text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"><Clapperboard className="h-4 w-4" /> Motion design</p>
              <h2 className="max-w-2xl font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">
                Your flyer, <HeadlineChip icon={Play} tone="mint" /> now in motion.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">Switch the chat to Motion, import a reference and describe the feel you want. Claude Opus 5.5 studies the design and animates it for your brand, using your colours and your exact wording.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  ['Every format', 'Portrait 4:5 posts, 9:16 stories and reels, and 1:1 squares.'],
                  ['Ready to post', 'Download a video, or an HTML file that plays in any browser.'],
                  ['Revise by asking', 'Send a follow-up like “slower, and end on the logo” to get the next cut.'],
                  ['Rewards included', '50 credits a video, counted toward your SPYDA like every generation.'],
                ].map(([title, copy]) => (
                  <div key={title} className="rounded-[20px] border border-white/[0.07] bg-surface p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25">
                    <h3 className="font-heading text-base font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{copy}</p>
                  </div>
                ))}
              </div>
              <PrimaryPill to="/auth" className="mt-8">Animate a design</PrimaryPill>
            </div>
            <MotionPreview />
          </div>
        </section>

        <section id="samples" className="overflow-hidden py-20 sm:py-24">
          <div className="mb-12 px-4 text-center">
            <Eyebrow>Bring your reference</Eyebrow>
            <h2 className="mx-auto max-w-3xl font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">Your next design can start from work this detailed.</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">Use a strong visual reference, then replace the message and brand ingredients that need to become yours.</p>
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
                  <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground">Spyda is building a creative economy where eligible product usage becomes proof that you helped grow the network. You get faster, premium design work today and accrue participation in what Spyda can become tomorrow.</p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
                    <div className="rounded-[20px] border border-white/[0.08] bg-surface p-5"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Eligible usage</p><p className="mt-2 font-heading text-2xl font-semibold">1,000 credits</p><p className="mt-1 text-xs text-muted-foreground">consumed inside Spyda</p></div>
                    <div className="flex items-center justify-center"><span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><span aria-hidden="true" className="absolute inset-0 rounded-full bg-primary/40 motion-safe:animate-ping" /><ArrowRight className="relative h-4 w-4 rotate-90 sm:rotate-0" /></span></div>
                    <div className="rounded-[20px] border border-primary/30 bg-surface-raised p-5"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Community reward</p><div className="mt-2 flex items-center gap-2"><img src="/assets/spyda-credit.png" alt="" className="h-7 w-7 object-contain" /><p className="font-heading text-2xl font-semibold">1 SPYDA</p></div><p className="mt-1 text-xs text-primary">pre-launch allocation</p></div>
                  </div>

                  <div className="mt-7 grid gap-3 sm:grid-cols-3">
                    {[
                      [WandSparkles, 'Create', 'Use Spyda for real design work.'],
                      [Target, 'Accrue', 'Eligible credit spend builds your balance.'],
                      [Network, 'Launch together', 'The community target is 1B SPYDA.'],
                    ].map(([Icon, title, copy]) => {
                      const StepIcon = Icon as typeof WandSparkles
                      return <div key={String(title)} className="rounded-[18px] border border-white/[0.07] bg-surface p-4"><StepIcon className="h-4 w-4 text-primary" /><h3 className="mt-3 text-sm font-semibold">{String(title)}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{String(copy)}</p></div>
                    })}
                  </div>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <PrimaryPill to="/auth">Start creating and accruing</PrimaryPill>
                    <Link to="/auth" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-surface px-6 whitespace-nowrap font-heading text-[12px] font-semibold uppercase tracking-[0.14em] transition-all hover:-translate-y-0.5 hover:bg-surface-raised active:translate-y-0 active:scale-[0.98]"><ShieldCheck className="h-4 w-4 text-primary" /> Read the whitepaper in Spyda</Link>
                  </div>
                  <p className="mt-5 max-w-2xl text-[11px] leading-5 text-muted-foreground">Pre-launch SPYDA is a non-transferable reward record, not cash, a refund, a stablecoin, or guaranteed market value. Launch requires the community threshold plus security, utility, network, and legal readiness.</p>
                </div>

                <SpydaCoin />
              </div>

              <div className="mt-16 grid gap-4 md:grid-cols-3">
                {[
                  [Gift, 'text-primary', 'Usage becomes participation', 'Rewards follow eligible credits actually consumed, not money simply deposited into the wallet.'],
                  [Network, 'text-[#a9bcff]', 'One billion, earned together', 'The planned launch trigger is reached when user accounts collectively accrue 1 billion eligible SPYDA.'],
                  [ShieldCheck, 'text-[#ffab84]', 'Product and trust first', 'Spyda must remain useful before launch, and the token infrastructure must pass its readiness gates.'],
                ].map(([Icon, colour, title, copy]) => {
                  const CardIcon = Icon as typeof Gift
                  return (
                    <div key={String(title)} className="rounded-[24px] border border-white/[0.08] bg-surface p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06]"><CardIcon className={`h-5 w-5 ${String(colour)}`} /></span>
                      <h3 className="mt-5 font-heading text-base font-semibold">{String(title)}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{String(copy)}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="font-heading text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl">Pay for the design work you need.</h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">Fund your wallet, subscribe for a larger workload, or connect your own API key for a lower Spyda credit rate.</p>
            </div>
            <div className="mx-auto mt-14 flex max-w-7xl snap-x snap-mandatory gap-4 overflow-x-auto px-[8vw] pb-3 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-4">
              <PricingCard name="Wallet Funding" price="Any amount" detail="$1 = 100 Spyda credits" desc="Fund your wallet with the amount that matches the work in front of you." features={['Credits stay in your account', 'No recurring payment', '20 credits: Groq + GPT-Image 2', '30 credits: GPT-Image 2 only', '50 credits: motion by Claude Opus 5.5', 'Eligible spend accrues SPYDA']} texture="starter" />
              <PricingCard name="Creator" price="NGN 12,000" detail="30 days of access" desc="For creators handling regular campaigns, promotions, and client revisions." features={['1,200 credits per access period', 'Unlimited saved projects', 'Brand asset library', 'Eligible spend accrues SPYDA']} texture="creator" featured />
              <PricingCard name="Studio" price="NGN 30,000" detail="30 days of access" desc="For teams and high-volume creative work that needs more room to move." features={['3,500 credits per access period', 'Everything in Creator', 'Faster processing queue', 'Eligible spend accrues SPYDA']} texture="pro" />
              <PricingCard name="Bring Your API Key" price="5 credits" detail="per AI generation" desc="Use your own OpenAI API billing while Spyda provides the editing workflow and QA." features={['Connect your OpenAI API key', 'Optional Groq analysis key', '5 Spyda credits per generation', 'Eligible spend accrues SPYDA']} texture="free" />
            </div>
            <p className="mt-5 text-center text-xs text-muted-foreground">Paid access does not renew automatically. Payments are handled securely through Paystack.</p>
          </div>
        </section>

        <section id="faq" className="px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <Eyebrow>Questions</Eyebrow>
              <h2 className="font-heading text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-4xl">Know what to expect before you upload.</h2>
            </div>
            <div className="mt-12 space-y-3">
              <FAQItem question="What does Spyda actually do?" answer="Spyda turns a design you like into your own. Import a flyer or social design, tell Spyda what to change by typing or talking, and it generates your version while keeping the look. You can also animate it with Claude Opus 5.5 or edit every layer by hand in canvas mode." />
              <FAQItem question="Can I edit the design by hand?" answer="Yes. Canvas mode separates a flyer into layers you can move, resize, restyle and rewrite, with undo and an edit timeline. It is not a Photoshop file: layers are rebuilt from the flat image, and Make it editable cuts out the pictures." />
              <FAQItem question="How do motion designs work?" answer="Switch the chat to Motion, import a reference and describe what you want. Claude Opus 5.5 writes the animation, you watch it in the chat, and you can download it as a video or an HTML file. Each motion uses 50 credits, and follow-up messages revise the last one." />
              <FAQItem question="Can I talk instead of typing?" answer="Yes. Tap the microphone in the chat box and speak; your words appear in the message for you to check and send. It uses your browser's own speech recognition, so it works in Chrome, Edge and Safari." />
              <FAQItem question="Can I replace logos and product images?" answer="Yes. Upload a replacement on the matching design atom or through Essentials. Spyda also supports exact placement controls for detected image regions before the AI generation step." />
              <FAQItem question="Can I keep my brand fonts and colors?" answer="Yes. Brand Constants lets you set heading and body fonts, HEX colors, and the visual style that should guide the revised design." />
              <FAQItem question="How do Spyda Token rewards work?" answer="For every 1,000 eligible Spyda Credits consumed on qualifying product actions, your account accrues 1 pre-launch SPYDA allocation. Funding the wallet alone does not create a reward; the credits must be used inside Spyda." />
              <FAQItem question="When will the Spyda Token launch?" answer="The planned community trigger is reached when users collectively hold 1 billion eligible, accrued SPYDA. Launch also depends on security audits, useful token infrastructure, network selection, claim controls, and legal readiness." />
              <FAQItem question="Is accrued SPYDA the same as cash?" answer="No. Before launch, accrued SPYDA is a non-transferable reward record. It is not cash, a refund, a stablecoin, or a guarantee that a future token will have a specific market price." />
              <FAQItem question="Do I need to be a professional designer?" answer="No. Spyda is built for anyone who can point to a design they like and clearly choose what should stay, what should change, and what should be removed." />
            </div>
          </div>
        </section>

        <section className="px-2 pb-8 sm:px-3">
          <div className="relative mx-auto overflow-hidden rounded-[28px] bg-primary px-6 py-16 text-center text-primary-foreground sm:rounded-[34px] sm:px-12 sm:py-20">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[#8bd3ff]/50 blur-3xl" />
            <div className="relative">
              <h2 className="mx-auto max-w-3xl font-heading text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-6xl">Stop rebuilding good designs from zero.</h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-primary-foreground/75">Bring the reference. Choose the exact changes. Let Spyda help you create the next version without losing the direction that made the original work.</p>
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
