import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award,
  Blocks,
  Check,
  ChevronDown,
  Clock3,
  Coins,
  FolderKanban,
  GraduationCap,
  KeyRound,
  Layers3,
  LockKeyhole,
  Medal,
  Palette,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Ticket,
  Trophy,
  Upload,
  UserCog,
  Wallet,
  Wand2,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════
   Guide content model
   ═══════════════════════════════════════════════ */

type GuideDifficulty = 'Starter' | 'Core' | 'Advanced'

type Guide = {
  id: string
  title: string
  summary: string
  minutes: number
  xp: number
  difficulty: GuideDifficulty
  icon: React.ElementType
  steps: string[]
  proTip?: string
}

type GuideSection = {
  id: string
  number: string
  title: string
  tagline: string
  badgeName: string
  accent: string
  guides: Guide[]
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'getting-started',
    number: '01',
    title: 'Getting Started',
    tagline: 'From your first upload to a workspace you can navigate blind.',
    badgeName: 'First Thread',
    accent: '#9dfab0',
    guides: [
      {
        id: 'core-concept',
        title: 'The Core Concept: Reference-Guided Design',
        summary: 'Understand why Spyda starts from a design you already trust instead of a blank canvas.',
        minutes: 3,
        xp: 20,
        difficulty: 'Starter',
        icon: Sparkles,
        steps: [
          'Pick a flyer, poster, or social design whose structure already works for you.',
          'Spyda dissects it into design atoms: text, images, logos, calls to action, colors, and layout roles.',
          'You choose up to 3 focused changes per round — everything else stays protected.',
          'The generated result becomes a "child" version, while the original parent stays untouched.',
        ],
        proTip: 'Spyda is not a blank-canvas generator. The reference is a layout contract, not loose inspiration.',
      },
      {
        id: 'first-round',
        title: 'Your First Round: Upload & Extract',
        summary: 'Upload an image and watch Spyda extract its design intelligence automatically.',
        minutes: 5,
        xp: 30,
        difficulty: 'Starter',
        icon: Upload,
        steps: [
          'Open the Canvas and drop in a PNG, JPG, or WEBP reference (up to 20MB).',
          'Spyda auto-analyzes the upload — reading text, layout, colors, fonts, and atoms.',
          'Review the detected Design Atoms in the right panel; each one is an editable component.',
          'Select 1–3 atoms to change, then press Apply to generate your first child design.',
        ],
        proTip: 'Sharper, higher-resolution references produce more accurate atom detection.',
      },
      {
        id: 'workspace-overview',
        title: 'Workspace Overview',
        summary: 'Learn what lives in the Canvas, Projects, Gallery, and History views.',
        minutes: 4,
        xp: 20,
        difficulty: 'Starter',
        icon: FolderKanban,
        steps: [
          'Canvas — your live editing surface: source, child source, atoms, and brand controls.',
          'Projects — every reference you have worked on, with Active and Archived filters.',
          'Gallery — the generated designs you have produced across rounds.',
          'History — a timeline of past work you can reopen and continue from at any point.',
        ],
      },
    ],
  },
  {
    id: 'ai-rounds',
    number: '02',
    title: 'Running AI Design Rounds',
    tagline: 'Prompting, validation, and the parent-to-child iteration loop.',
    badgeName: 'Round Runner',
    accent: '#8bd3ff',
    guides: [
      {
        id: 'prompting-constraints',
        title: 'Prompting & Constraints',
        summary: 'Tell the AI exactly what to change — and just as importantly, what to keep.',
        minutes: 6,
        xp: 30,
        difficulty: 'Core',
        icon: Wand2,
        steps: [
          'On each atom, choose Same (protect it), Customize (change it), or Delete (remove it).',
          'For text atoms, type the exact replacement copy — Spyda treats it as literal content.',
          'For image and logo atoms, upload a replacement file and drag it into exact position.',
          'Use the 3 Essentials slots for changes the detected atoms do not cover.',
          'Keep each round to 3 focused changes — small rounds keep the layout faithful.',
        ],
        proTip: 'One large prompt that changes everything is how layouts drift. Three small changes is how they survive.',
      },
      {
        id: 'qa-gate',
        title: 'The QA Gate',
        summary: 'Use validation constraints so every generation meets your standards before you accept it.',
        minutes: 5,
        xp: 30,
        difficulty: 'Core',
        icon: ShieldCheck,
        steps: [
          'After each generation, open the QA view via the shield icon next to the page title.',
          'Review the Intent & Fidelity score, detected issues, and what was confirmed as solid.',
          'Check layout, text, asset, and replacement-size verdicts individually.',
          'If QA flags problems, apply the Suggested Corrective Essentials with one click and regenerate.',
        ],
        proTip: 'QA runs in the background — your design is usable immediately while the report finishes.',
      },
      {
        id: 'iterative-design',
        title: 'Iterative Design: Parent to Child',
        summary: 'Take a generated child version and use it as the new reference for the next round.',
        minutes: 5,
        xp: 40,
        difficulty: 'Advanced',
        icon: RefreshCw,
        steps: [
          'After a successful round, the child design automatically becomes your working source.',
          'Atoms you already changed are retired from the list, so each round stays focused.',
          'Stack rounds: change the headline in round one, the product photo in round two, colors in round three.',
          'Compare any child against its parent at every step to catch drift early.',
        ],
        proTip: 'Think in rounds, not in one giant edit. Ten small rounds beat one prompt with ten instructions.',
      },
    ],
  },
  {
    id: 'brand-templates',
    number: '03',
    title: 'Brand Assets & Templates',
    tagline: 'Lock in your identity and turn winning layouts into reusable assets.',
    badgeName: 'Brand Guardian',
    accent: '#c9b8ff',
    guides: [
      {
        id: 'brand-lockin',
        title: 'Brand Lock-in',
        summary: 'Upload and enforce your logos, brand colors, and typography across generations.',
        minutes: 6,
        xp: 30,
        difficulty: 'Core',
        icon: Palette,
        steps: [
          'Open Brand Assets and save your logos, HEX colors, and font choices once.',
          'On the Canvas, flip the Brand Constants toggle ON to apply them to every reconstruction.',
          'Set heading and body fonts, primary, secondary, and accent colors, and a visual style.',
          'Uploaded logos are placed at exact size and protected — the model never redraws them.',
        ],
        proTip: 'Leave Brand Constants OFF when you want to preserve the parent design’s existing look.',
      },
      {
        id: 'template-library',
        title: 'Template Library',
        summary: 'Save a successful layout as a reusable template for future campaigns.',
        minutes: 4,
        xp: 20,
        difficulty: 'Core',
        icon: Blocks,
        steps: [
          'Open Templates in the sidebar to browse the layouts available to your workspace.',
          'Choose Use Template to load one straight onto the Canvas as a fresh reference.',
          'Spyda re-analyzes it into atoms so you can swap in your own message and brand.',
          'Keep your strongest generated designs — they become tomorrow’s starting points.',
        ],
      },
      {
        id: 'marketplace',
        title: 'Marketplace',
        summary: 'How buying and selling premium design templates will work on Spyda.',
        minutes: 3,
        xp: 20,
        difficulty: 'Advanced',
        icon: Store,
        steps: [
          'The marketplace lets creators list proven, high-performing templates for others to license.',
          'Buyers get a battle-tested layout; sellers earn from work they already perfected.',
          'Settlement is designed to run through the Spyda wallet — credits today, SPYDA and USD rails later.',
          'Listing quality is curated: templates must pass the same QA bar as generated designs.',
        ],
      },
    ],
  },
  {
    id: 'wallet-economics',
    number: '04',
    title: 'Wallet & Economics',
    tagline: 'Credits, BYOK savings, and where the Web3 rails are headed.',
    badgeName: 'Credit Strategist',
    accent: '#ffd58f',
    guides: [
      {
        id: 'spyda-credits',
        title: 'Spyda Credits',
        summary: 'Fund your wallet and understand exactly what each generation costs.',
        minutes: 4,
        xp: 20,
        difficulty: 'Starter',
        icon: Wallet,
        steps: [
          'Open Wallet → Fund and pick a credit pack or enter any custom amount.',
          'Every $1 adds 100 credits; payment is processed securely through Paystack.',
          'A managed AI round costs 20 credits; QA and reconstruction are included.',
          'Every 1,000 credits you spend accrues 1 pre-launch SPYDA token to your account.',
        ],
        proTip: 'Redeem promotional coupon codes on the Fund page for instant credit top-ups.',
      },
      {
        id: 'byok',
        title: 'BYOK: Bring Your Own Key',
        summary: 'Connect your own OpenAI key to cut the credit cost per generation by 75%.',
        minutes: 5,
        xp: 30,
        difficulty: 'Core',
        icon: KeyRound,
        steps: [
          'Open Settings and paste your OpenAI API key into the OpenAI API Key field.',
          'Optionally add a Groq key to dramatically speed up the design dissection step.',
          'With BYOK active, every AI round drops from 20 credits to just 5 credits.',
          'Your key is used for your generations only — model usage bills to your own OpenAI account.',
        ],
        proTip: 'Heavy user? BYOK pays for itself almost immediately: 4x more rounds per credit.',
      },
      {
        id: 'web3-rails',
        title: 'Future Web3 Rails',
        summary: 'A brief explainer on how Spyda Tokens and USD settlement will work.',
        minutes: 4,
        xp: 30,
        difficulty: 'Advanced',
        icon: Coins,
        steps: [
          'Your wallet already tracks three assets: Spyda Credits, a USD balance, and Spyda Tokens.',
          'SPYDA accrues from eligible credit spend: 1,000 credits consumed = 1 SPYDA recorded.',
          'The token goes on-chain after the community earns 1B SPYDA and readiness gates pass.',
          'USD settlement rails will handle funding and payouts once verification goes live.',
          'Read the Whitepaper (right above this page in the sidebar) for the full token design.',
        ],
      },
    ],
  },
  {
    id: 'account-security',
    number: '05',
    title: 'Account & Security',
    tagline: 'Keep your profile sharp and your account locked down.',
    badgeName: 'Vault Keeper',
    accent: '#ff9d8a',
    guides: [
      {
        id: 'managing-account',
        title: 'Managing Your Account',
        summary: 'Update your profile details, display name, and workspace preferences.',
        minutes: 3,
        xp: 20,
        difficulty: 'Starter',
        icon: UserCog,
        steps: [
          'Open Settings from the sidebar or by tapping your avatar in the top bar.',
          'Update your display name, default brand name, and profile picture.',
          'Review your current plan and manage your subscription from the same page.',
          'Press Save All Changes — updates apply across your whole workspace.',
        ],
      },
      {
        id: 'two-factor',
        title: 'Two-Factor Authentication',
        summary: 'Set up an authenticator app for secure access to your account.',
        minutes: 5,
        xp: 30,
        difficulty: 'Core',
        icon: Smartphone,
        steps: [
          'Open Settings and find the Security panel.',
          'Choose to enroll two-factor authentication and scan the QR code with an authenticator app.',
          'Enter the 6-digit code from the app to confirm the enrollment.',
          'From then on, sign-ins require both your password and a fresh authenticator code.',
        ],
        proTip: 'Any TOTP app works: Google Authenticator, Authy, 1Password, or Microsoft Authenticator.',
      },
      {
        id: 'billing-coupons',
        title: 'Billing & Coupons',
        summary: 'Redeem promotional codes and keep track of what you’ve spent.',
        minutes: 3,
        xp: 20,
        difficulty: 'Starter',
        icon: Ticket,
        steps: [
          'Go to Wallet → Fund and scroll to the "Have a coupon code?" card.',
          'Enter the code in SPYDA-XXXX-XXXX format and press Redeem coupon.',
          'Credits land in your balance instantly; each code works exactly once.',
          'Track spend from the Wallet — usage economics shows your cost per round.',
        ],
      },
    ],
  },
]

/* ═══════════════════════════════════════════════
   Gamification: XP, ranks, and persistence
   ═══════════════════════════════════════════════ */

const GUIDES_PROGRESS_KEY = 'spyda.guides.progress.v1'

const RANKS = [
  { threshold: 0, name: 'Hatchling', blurb: 'Every spider starts somewhere.' },
  { threshold: 70, name: 'Silk Spinner', blurb: 'The first threads are holding.' },
  { threshold: 160, name: 'Web Weaver', blurb: 'Rounds, QA, iteration — connected.' },
  { threshold: 260, name: 'Orb Architect', blurb: 'Brand, templates, and economics mastered.' },
  { threshold: 360, name: 'Spyda Master', blurb: 'The whole web is yours.' },
]

const ALL_GUIDES = GUIDE_SECTIONS.flatMap(section => section.guides)
const TOTAL_XP = ALL_GUIDES.reduce((sum, guide) => sum + guide.xp, 0)

function loadCompletedGuides(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(GUIDES_PROGRESS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveCompletedGuides(completed: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GUIDES_PROGRESS_KEY, JSON.stringify([...completed]))
  } catch {
    /* storage unavailable — progress just won't persist */
  }
}

const DIFFICULTY_STYLES: Record<GuideDifficulty, string> = {
  Starter: 'border-primary/25 bg-primary/[0.08] text-primary',
  Core: 'border-[#8bd3ff]/25 bg-[#8bd3ff]/[0.08] text-[#8bd3ff]',
  Advanced: 'border-[#ff9d8a]/25 bg-[#ff9d8a]/[0.08] text-[#ffb3a4]',
}

/* ═══════════════════════════════════════════════
   Guide card
   ═══════════════════════════════════════════════ */

function GuideCard({ guide, accent, completed, expanded, onToggleExpand, onToggleComplete }: {
  guide: Guide
  accent: string
  completed: boolean
  expanded: boolean
  onToggleExpand: () => void
  onToggleComplete: () => void
}) {
  const GuideIcon = guide.icon
  return (
    <article className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-300 ${completed ? 'border-primary/30 bg-primary/[0.035]' : 'border-white/[0.07] bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.03]'}`}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100" style={{ backgroundColor: `${accent}14` }} />

      <button type="button" onClick={onToggleExpand} aria-expanded={expanded} className="relative flex flex-1 flex-col p-5 text-left">
        <div className="flex items-start justify-between gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${completed ? 'border-primary/35 bg-primary/[0.1]' : 'border-white/[0.09] bg-white/[0.03]'}`}>
            {completed ? <Check className="h-[18px] w-[18px] text-primary" strokeWidth={2.4} /> : <GuideIcon className="h-[18px] w-[18px]" strokeWidth={1.7} style={{ color: accent }} />}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${DIFFICULTY_STYLES[guide.difficulty]}`}>{guide.difficulty}</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground"><Zap className="h-2.5 w-2.5 text-primary" /> {guide.xp} XP</span>
          </div>
        </div>

        <h4 className={`mt-4 font-heading text-[15px] font-semibold leading-snug ${completed ? 'text-foreground/75' : 'text-foreground'}`}>{guide.title}</h4>
        <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{guide.summary}</p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70"><Clock3 className="h-3.5 w-3.5" /> {guide.minutes} min read</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
            {expanded ? 'Hide steps' : 'View steps'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </button>

      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">
            <ol className="space-y-2.5">
              {guide.steps.map((step, index) => (
                <li key={index} className="flex items-start gap-2.5 text-[13px] leading-6 text-foreground/85">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-[10px] font-bold" style={{ color: accent }}>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            {guide.proTip && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-primary/15 bg-primary/[0.04] px-3.5 py-3 text-xs leading-5 text-muted-foreground">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span><strong className="font-semibold text-primary">Pro tip:</strong> {guide.proTip}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onToggleComplete}
              className={`mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-bold transition-colors ${completed ? 'border border-white/[0.1] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
            >
              {completed ? (<><RefreshCw className="h-3.5 w-3.5" /> Mark as not done</>) : (<><Check className="h-3.5 w-3.5" strokeWidth={2.6} /> Mark complete · +{guide.xp} XP</>)}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

/* ═══════════════════════════════════════════════
   Guides view
   ═══════════════════════════════════════════════ */

export function GuidesView() {
  const [completed, setCompleted] = useState<Set<string>>(loadCompletedGuides)
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null)
  const [xpFlash, setXpFlash] = useState<{ id: string; xp: number } | null>(null)

  useEffect(() => {
    saveCompletedGuides(completed)
  }, [completed])

  useEffect(() => {
    if (!xpFlash) return
    const timeout = window.setTimeout(() => setXpFlash(null), 1800)
    return () => window.clearTimeout(timeout)
  }, [xpFlash])

  const toggleComplete = useCallback((guide: Guide) => {
    setCompleted(previous => {
      const next = new Set(previous)
      if (next.has(guide.id)) {
        next.delete(guide.id)
      } else {
        next.add(guide.id)
        setXpFlash({ id: guide.id, xp: guide.xp })
      }
      return next
    })
  }, [])

  const stats = useMemo(() => {
    const earnedXp = ALL_GUIDES.reduce((sum, guide) => sum + (completed.has(guide.id) ? guide.xp : 0), 0)
    const rankIndex = RANKS.reduce((current, rank, index) => (earnedXp >= rank.threshold ? index : current), 0)
    const rank = RANKS[rankIndex]
    const nextRank = RANKS[rankIndex + 1] || null
    const rankProgress = nextRank
      ? Math.min(100, Math.round(((earnedXp - rank.threshold) / (nextRank.threshold - rank.threshold)) * 100))
      : 100
    const badges = GUIDE_SECTIONS.filter(section => section.guides.every(guide => completed.has(guide.id)))
    return { earnedXp, rank, nextRank, rankProgress, badges, doneCount: completed.size }
  }, [completed])

  return (
    <div className="min-h-full bg-[#080a0a]">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {/* ── Hero / rank header ── */}
        <header className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[linear-gradient(135deg,#0b100e_0%,#0d1a14_45%,#123024_100%)] p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/[0.09] blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-[#88a8ff]/[0.06] blur-[90px]" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                <GraduationCap className="h-3.5 w-3.5" /> Spyda Guides
              </div>
              <h1 className="mt-5 max-w-2xl font-heading text-3xl font-semibold leading-tight sm:text-4xl">Master the web, one thread at a time.</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                Fifteen focused guides take you from your first upload to advanced iteration workflows.
                Complete guides to earn XP, climb ranks, and collect a badge for every mastered track.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {GUIDE_SECTIONS.map(section => {
                  const earned = section.guides.every(guide => completed.has(guide.id))
                  return (
                    <span key={section.id} title={`${section.badgeName} — complete every guide in ${section.title}`} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${earned ? 'border-primary/35 bg-primary/[0.1] text-primary' : 'border-white/[0.08] bg-white/[0.02] text-muted-foreground/50'}`}>
                      {earned ? <Medal className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />} {section.badgeName}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Rank card */}
            <div className="rounded-xl border border-white/[0.1] bg-black/30 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current rank</p>
                  <p className="mt-1 font-heading text-xl font-semibold text-foreground">{stats.rank.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{stats.rank.blurb}</p>
                </div>
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full -rotate-90">
                    <circle cx="28" cy="28" r="24" fill="none" strokeWidth="4" className="stroke-white/[0.07]" />
                    <circle cx="28" cy="28" r="24" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-700" strokeDasharray={`${2 * Math.PI * 24}`} strokeDashoffset={`${2 * Math.PI * 24 * (1 - stats.earnedXp / TOTAL_XP)}`} />
                  </svg>
                  <Trophy className={`h-5 w-5 ${stats.doneCount ? 'text-primary' : 'text-muted-foreground/40'}`} strokeWidth={1.7} />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  <span>{stats.earnedXp} XP</span>
                  <span>{stats.nextRank ? `${stats.nextRank.threshold} XP → ${stats.nextRank.name}` : 'Max rank reached'}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#9dfab0,#5eead4)] transition-[width] duration-700" style={{ width: `${stats.rankProgress}%` }} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.07] rounded-lg border border-white/[0.07] bg-white/[0.02] text-center">
                <div className="px-2 py-2.5"><p className="font-heading text-base font-semibold">{stats.doneCount}<span className="text-[10px] text-muted-foreground">/{ALL_GUIDES.length}</span></p><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Guides</p></div>
                <div className="px-2 py-2.5"><p className="font-heading text-base font-semibold">{stats.earnedXp}<span className="text-[10px] text-muted-foreground">/{TOTAL_XP}</span></p><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">XP</p></div>
                <div className="px-2 py-2.5"><p className="font-heading text-base font-semibold">{stats.badges.length}<span className="text-[10px] text-muted-foreground">/{GUIDE_SECTIONS.length}</span></p><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Badges</p></div>
              </div>
            </div>
          </div>
        </header>

        {/* ── XP toast ── */}
        {xpFlash && (
          <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
            <div className="flex items-center gap-2 rounded-full border border-primary/35 bg-[#0b110d]/95 px-4 py-2 text-sm font-bold text-primary shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_24px_rgba(157,250,176,0.15)] backdrop-blur-md">
              <Zap className="h-4 w-4" /> +{xpFlash.xp} XP earned
            </div>
          </div>
        )}

        {/* ── Learning path sections ── */}
        <div className="mt-10 space-y-12">
          {GUIDE_SECTIONS.map(section => {
            const sectionDone = section.guides.filter(guide => completed.has(guide.id)).length
            const badgeEarned = sectionDone === section.guides.length
            return (
              <section key={section.id} aria-labelledby={`guides-${section.id}`}>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-heading text-sm font-semibold" style={{ borderColor: `${section.accent}30`, backgroundColor: `${section.accent}0d`, color: section.accent }}>
                      {section.number}
                    </span>
                    <div>
                      <h2 id={`guides-${section.id}`} className="font-heading text-xl font-semibold sm:text-2xl">{section.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{section.tagline}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${badgeEarned ? 'border-primary/35 bg-primary/[0.1] text-primary' : 'border-white/[0.08] bg-white/[0.02] text-muted-foreground'}`}>
                      {badgeEarned ? <Award className="h-3.5 w-3.5" /> : <Layers3 className="h-3.5 w-3.5" />}
                      {badgeEarned ? `${section.badgeName} earned` : `${sectionDone}/${section.guides.length} complete`}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.guides.map(guide => (
                    <GuideCard
                      key={guide.id}
                      guide={guide}
                      accent={section.accent}
                      completed={completed.has(guide.id)}
                      expanded={expandedGuide === guide.id}
                      onToggleExpand={() => setExpandedGuide(previous => (previous === guide.id ? null : guide.id))}
                      onToggleComplete={() => toggleComplete(guide)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        {/* ── Footer CTA ── */}
        <footer className="mt-14 overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.035] p-6 text-center sm:p-10">
          <ScanSearch className="mx-auto h-8 w-8 text-primary" strokeWidth={1.5} />
          <h2 className="mx-auto mt-4 max-w-xl font-heading text-2xl font-semibold sm:text-3xl">The fastest way to learn Spyda is to run a round.</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Upload a reference on the Canvas, pick one change, and watch the parent-to-child loop in action. Every guide above will make more sense once you have shipped your first child design.</p>
        </footer>
      </div>
    </div>
  )
}
