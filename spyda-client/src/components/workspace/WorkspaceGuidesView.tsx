import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award,
  Blocks,
  BookOpen,
  Check,
  ChevronDown,
  Clapperboard,
  Clock3,
  Coins,
  Download,
  FolderKanban,
  Gauge,
  KeyRound,
  Layers3,
  LockKeyhole,
  Medal,
  MousePointerClick,
  Palette,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Trophy,
  Type,
  UserCog,
  Wallet,
  Wand2,
  WandSparkles,
  Zap,
} from '../ui/icons'

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
    tagline: 'What Spyda is, what it costs, and where everything lives.',
    badgeName: 'First Thread',
    accent: '#9dfab0',
    guides: [
      {
        id: 'core-concept',
        title: 'What Spyda Does',
        summary: 'Turn a design you like into your own, by chat or by hand, then animate it or cut a video.',
        minutes: 3,
        xp: 20,
        difficulty: 'Starter',
        icon: Sparkles,
        steps: [
          'Start from a flyer or social design you already like: Spyda keeps its look and changes only what you ask.',
          'Spyda AI (the chat) makes your version from plain words, typed or spoken.',
          'Canvas mode is the full flyer editor: every text, picture and shape is a layer you can edit by hand.',
          'The Video editor cuts, grades and exports videos with effects, transitions, titles and music.',
          'Motion designs turn a flyer into a short animation, written by Claude Opus 5.5.',
        ],
        proTip: 'The reference is a layout contract, not loose inspiration: what you do not ask to change stays as it is.',
      },
      {
        id: 'free-to-use',
        title: 'Free to Use, Pay When You Download',
        summary: 'Spyda has no subscriptions, now or ever. Everything runs on Spyda credits.',
        minutes: 3,
        xp: 20,
        difficulty: 'Starter',
        icon: Coins,
        steps: [
          'Using Spyda is free: open the editors, design, edit, preview and save as much as you like.',
          'Downloading a finished flyer or video costs 100 Spyda credits; the compressor adds 50.',
          'AI work uses credits as it runs: 20 or 30 per generation, 50 per motion design, 5 with your own API key.',
          'Recharge from just $1 (100 credits). Credits stay in your wallet until you use them.',
          'New features will use Spyda credits too. There will never be a subscription.',
        ],
        proTip: 'A $1 recharge is enough to download a finished flyer, so anyone can start.',
      },
      {
        id: 'workspace-overview',
        title: 'Find Your Way Around',
        summary: 'What each place in the sidebar is for.',
        minutes: 4,
        xp: 20,
        difficulty: 'Starter',
        icon: FolderKanban,
        steps: [
          'Spyda AI — the chat where you make flyers and motion designs; Canvas mode opens from here.',
          'Video editor — import footage and edit it on a timeline.',
          'Gallery and History — everything you have made, ready to reopen, edit or download.',
          'Projects — your work, with Active and Archived filters.',
          'Templates — Spyda templates plus the marketplace of flyers and motion designs from the community.',
          'Wallet, Tasks and Knowledge base — your credits and SPYDA, rewards to earn, and these guides.',
        ],
      },
    ],
  },
  {
    id: 'spyda-ai',
    number: '02',
    title: 'Spyda AI & Motion',
    tagline: 'Make it yours with words, then make it move.',
    badgeName: 'Thread Talker',
    accent: '#8bd3ff',
    guides: [
      {
        id: 'make-it-yours',
        title: 'Make a Design Yours in the Chat',
        summary: 'Import a reference and describe the changes; Spyda confirms the cost before it generates.',
        minutes: 5,
        xp: 30,
        difficulty: 'Starter',
        icon: Wand2,
        steps: [
          'In Spyda AI, attach the flyer you like and say what should change: the name, the date, the colours, the photo.',
          'Tap the microphone to speak instead of typing; check the words, then send.',
          'Spyda shows the plan and its credit cost; confirm and it generates your version.',
          'Ask for follow-up changes in the same conversation; each one refines the last result.',
          'Open the result in Canvas mode to fine-tune any layer by hand.',
        ],
        proTip: 'Name exact text in quotes ("Grand Opening, 12 June") so it is copied word for word.',
      },
      {
        id: 'motion-designs',
        title: 'Motion Designs by Claude',
        summary: 'Turn a flyer into a short animation for posts, stories and reels.',
        minutes: 5,
        xp: 30,
        difficulty: 'Core',
        icon: Zap,
        steps: [
          'Switch the chat to Motion and choose a size (post, story, wide).',
          'Attach the reference and describe the feel: calm, bold, playful, product reveal.',
          'Claude Opus 5.5 writes the animation and it plays right in the chat. Each motion uses 50 credits.',
          'Ask for changes in follow-up messages; if it ever shows an error, press Fix and it repairs itself.',
          'Download it as a video (or the HTML file) through the Spyda download card.',
        ],
      },
      {
        id: 'chat-to-canvas',
        title: 'Move Your Work to Canvas Mode',
        summary: 'Carry a chat result into the editor, or start a design from the Create a design dialog.',
        minutes: 3,
        xp: 20,
        difficulty: 'Starter',
        icon: Layers3,
        steps: [
          'Under any result in the chat, press Open in canvas.',
          'Or press Canvas mode to open Create a design: pick a size (Instagram post, story, flyer, custom) or a blank canvas.',
          'Choose Magic Layers to upload a flat flyer and have it split into editable layers.',
          'Press Done in the editor to save and return; your design stays in Projects and History.',
        ],
      },
    ],
  },
  {
    id: 'canvas-mode',
    number: '03',
    title: 'Canvas Mode: The Flyer Editor',
    tagline: 'Pro layers, typography, effects and animation.',
    badgeName: 'Orb Weaver',
    accent: '#c4a3ff',
    guides: [
      {
        id: 'magic-layers',
        title: 'Magic Layers',
        summary: 'Split a flat flyer into live text, its subject, its logos and a clean background.',
        minutes: 5,
        xp: 40,
        difficulty: 'Core',
        icon: Sparkles,
        steps: [
          'Select a picture (or upload one from Create a design) and press Magic layers.',
          'Spyda reads every line of text and turns it into live, editable text in a matching font.',
          'It outlines the main subject and the logos and icons, and lifts each onto its own layer.',
          'The background behind them is filled in, so you can move anything without leaving a hole.',
          'Edit, move or delete any layer. One undo puts the original picture back.',
        ],
        proTip: 'Pictures added to the canvas are shown at 4K, so small text stays crisp when you zoom in.',
      },
      {
        id: 'layers-tools',
        title: 'Layers, Selection and Arranging',
        summary: 'Select, move, group and align like in a desktop design app.',
        minutes: 6,
        xp: 30,
        difficulty: 'Core',
        icon: MousePointerClick,
        steps: [
          'Click a layer to select it; Shift-click or drag a box to select several. Click outside to deselect.',
          'Drag to move: magenta guides snap edges and centres to other layers and the frame.',
          'Group with Ctrl+G, ungroup with Ctrl+Shift+G; align and spread several layers from the panel.',
          'Right-click for the menu: duplicate, bring forward, send back, copy and paste style, delete.',
          'Every change can be undone (Ctrl+Z) and redone (Ctrl+Shift+Z); History lists each step.',
        ],
      },
      {
        id: 'typography',
        title: 'Text and Typography',
        summary: 'Fonts, weights, line spacing, paragraph spacing and type styles.',
        minutes: 5,
        xp: 30,
        difficulty: 'Starter',
        icon: Type,
        steps: [
          'Double-click any text to edit it right on the canvas.',
          'Pick the font and weight from the Spyda menus; each font previews in its own typeface.',
          'Set Line spacing, Letter spacing and Paragraph spacing (the room after each Enter) with the sliders.',
          'Toggle Bold, Italic, Underline and Strikethrough, and letter case: As typed, UPPERCASE, lowercase, Title Case.',
          'Align left, centre, right or justified; resize text from a corner to scale the font with it.',
        ],
      },
      {
        id: 'effects-animation',
        title: 'Effects and Animation',
        summary: 'Shadows, glows, gradients and blends, then entrances and loops you can export as video.',
        minutes: 6,
        xp: 40,
        difficulty: 'Advanced',
        icon: WandSparkles,
        steps: [
          'Effects: drop shadow, glow, gradient fill, blend mode, blur, brightness, contrast, saturation and black & white.',
          'Open Animate to give each layer an entrance (fade, rise, pop, slide, typewriter and more) and a loop.',
          'Use Magic Animate to animate the whole design at once, then press Play (Ctrl+Enter) to preview.',
          'Export video records the animation as an MP4 through the download card.',
        ],
      },
    ],
  },
  {
    id: 'video-editor',
    number: '04',
    title: 'The Video Editor',
    tagline: 'Cut, grade, add effects, transitions, titles and music.',
    badgeName: 'Reel Spinner',
    accent: '#ff9ac0',
    guides: [
      {
        id: 'video-timeline',
        title: 'Import and Edit on the Timeline',
        summary: 'Bring in clips, pictures and music, then trim, split and arrange them.',
        minutes: 6,
        xp: 30,
        difficulty: 'Starter',
        icon: Clapperboard,
        steps: [
          'Open the Video editor from the sidebar, the Create a design dialog, or the Design | Video switch in Canvas mode.',
          'Import video, pictures and music (or drop files anywhere). Your files stay on your device.',
          'Drag media from the library onto the video or music track; a glowing line shows where it lands.',
          'Drag a clip’s edges to trim it, drag clips to reorder, and press S to split at the playhead.',
          'The timeline fits your whole edit; Shift or Ctrl + mouse wheel zooms, and the green scrubber below scrolls it.',
          'Undo and redo every step with the buttons or Ctrl+Z / Ctrl+Shift+Z.',
        ],
        proTip: 'The first clip sets the video’s shape (16:9, 9:16, 1:1 or 4:5), so nothing is cropped.',
      },
      {
        id: 'video-look',
        title: 'Colour, Effects and Transitions',
        summary: 'Grade like a pro and give every cut its own transition.',
        minutes: 6,
        xp: 40,
        difficulty: 'Core',
        icon: Palette,
        steps: [
          'Select a clip and grade it: exposure, brightness, contrast, highlights, shadows, saturation, vibrance, temperature, tint, hue, fade and vignette.',
          'Start from a look (Punchy, Warm sunset, Moody, Matte film…) and apply it to every clip in one click.',
          'Add one of 19 effects with an intensity slider: Cinematic, VHS, Glitch, Glow, Duotone, Light leak, Camera shake and more.',
          'Click a ◆ between two clips to choose one of 15 transitions and its length.',
          'Frame each clip: Fit inside, Blur fill or Fill frame; scale, move, rotate, flip, fade in and out, or add a slow zoom or pan.',
        ],
      },
      {
        id: 'video-titles-music',
        title: 'Titles, Music and Export',
        summary: 'Animated titles with full text control, music with fades, and the final download.',
        minutes: 5,
        xp: 30,
        difficulty: 'Core',
        icon: Type,
        steps: [
          'Add a title or a preset (lower third, caption, typewriter, outlined); drag it in the preview to place it.',
          'Style it: font, weight, colour, line, paragraph and letter spacing, outline, shadow and a background pill.',
          'Drop music on the music track; trim it, fade it in and out, or fit it to the video.',
          'Choose frame rate and quality, then Export video. It records in real time with sound and downloads as MP4.',
        ],
      },
    ],
  },
  {
    id: 'downloads',
    number: '05',
    title: 'Downloads & the Compressor',
    tagline: 'What a download costs, and how to make files far smaller.',
    badgeName: 'Silk Saver',
    accent: '#ffd36b',
    guides: [
      {
        id: 'download-card',
        title: 'How Downloading Works',
        summary: 'Every download goes through the Spyda download card.',
        minutes: 3,
        xp: 20,
        difficulty: 'Starter',
        icon: Download,
        steps: [
          'Press Download (or Export) anywhere: the card shows the price, the compressor switch and your balance.',
          'A download costs 100 Spyda credits; with the compressor on, 150.',
          'Spyda prepares the file first. Credits are taken only once it is ready, and the file is saved right after.',
          'If anything fails on the way, nothing is charged.',
        ],
      },
      {
        id: 'compressor',
        title: 'The Graphics and Video Compressor',
        summary: 'Up to 90% smaller files that look the same.',
        minutes: 4,
        xp: 30,
        difficulty: 'Core',
        icon: Gauge,
        steps: [
          'Turn on the compressor in the download card (+50 credits). Spyda remembers your choice.',
          'Pictures are re-encoded and checked against the original pixel by pixel; only a version that looks identical is kept.',
          'Videos are re-encoded to MP4 with your browser’s own video encoder at a bitrate chosen to keep every detail.',
          'The card shows how much smaller the file became. If it could not be made smaller without losing quality, the original is kept and the compressor is not charged.',
        ],
        proTip: 'Compressed pictures may download as WebP when that is much smaller; WebP opens in all modern browsers and apps.',
      },
    ],
  },
  {
    id: 'templates-marketplace',
    number: '06',
    title: 'Templates & Marketplace',
    tagline: 'Start from a template, or sell your own designs for credits.',
    badgeName: 'Web Trader',
    accent: '#8bd3ff',
    guides: [
      {
        id: 'template-library',
        title: 'Use a Template',
        summary: 'Start a design from Spyda’s templates or the community’s.',
        minutes: 3,
        xp: 20,
        difficulty: 'Starter',
        icon: Blocks,
        steps: [
          'Open Templates and choose the Flyers or Motion designs section.',
          'Filter by category or search, then press Use on any design.',
          'Community designs show their price in Spyda credits; once bought, they are yours to reuse.',
        ],
      },
      {
        id: 'marketplace',
        title: 'Sell Flyers and Motion Designs',
        summary: 'List your work and earn Spyda credits from every buyer.',
        minutes: 4,
        xp: 30,
        difficulty: 'Core',
        icon: Store,
        steps: [
          'In Templates, press List a design and choose Flyer or Motion design.',
          'Add the preview, the file (for motion designs), a name, a category and your price in Spyda credits.',
          'Listing costs 5 credits. When someone buys, their credits move to your wallet.',
          'Delete a listing at any time from the same page.',
        ],
      },
    ],
  },
  {
    id: 'wallet-economics',
    number: '07',
    title: 'Wallet, Credits & Rewards',
    tagline: 'Recharge from $1, see where credits go, and earn SPYDA.',
    badgeName: 'Credit Keeper',
    accent: '#9dfab0',
    guides: [
      {
        id: 'spyda-credits',
        title: 'Spyda Credits and Recharging',
        summary: 'Every $1 adds 100 credits. Recharge any amount, from $1.',
        minutes: 4,
        xp: 30,
        difficulty: 'Starter',
        icon: Wallet,
        steps: [
          'Open Wallet → Fund, pick a pack or enter any amount from $1, and pay securely through Paystack.',
          'Credits pay for: downloads (100), the compressor (+50), AI generations (20 or 30), motion designs (50) and marketplace purchases.',
          'Credits never expire and there is no recurring payment of any kind.',
          'Wallet activity lists every credit in and out, with a notification for each.',
        ],
      },
      {
        id: 'rewards-tasks',
        title: 'Earn Credits and SPYDA',
        summary: 'Tasks pay credits, and spending credits accrues SPYDA.',
        minutes: 4,
        xp: 30,
        difficulty: 'Core',
        icon: Trophy,
        steps: [
          'Open Tasks to claim the 60-credit welcome reward and complete community tasks for more credits.',
          'Every 1,000 Spyda credits you use (downloads included) accrues 1 SPYDA to your account.',
          'Before launch, accrued SPYDA is a non-transferable reward record, not cash.',
          'Redeem coupon codes (SPYDA-XXXX-XXXX) under Wallet → Fund for instant credits.',
        ],
      },
      {
        id: 'byok',
        title: 'Bring Your Own Key',
        summary: 'Use your own OpenAI key and generations cost only 5 credits.',
        minutes: 3,
        xp: 20,
        difficulty: 'Advanced',
        icon: KeyRound,
        steps: [
          'Open Settings and add your OpenAI API key (and optionally a Groq key).',
          'Image generations then bill your OpenAI account, and Spyda charges 5 credits for editing and QA.',
          'Motion designs and downloads keep their usual price.',
        ],
      },
    ],
  },
  {
    id: 'account-security',
    number: '08',
    title: 'Account & Security',
    tagline: 'Protect your account and take Spyda anywhere.',
    badgeName: 'Silk Shield',
    accent: '#ff9d8a',
    guides: [
      {
        id: 'managing-account',
        title: 'Your Account',
        summary: 'Profile, picture and settings in one place.',
        minutes: 3,
        xp: 20,
        difficulty: 'Starter',
        icon: UserCog,
        steps: [
          'Open Settings from the sidebar to change your name and profile picture.',
          'Manage your API keys and see Pricing & credits from the same page.',
          'Sign out from the sidebar at any time; your work stays in your account.',
        ],
      },
      {
        id: 'two-factor',
        title: 'Two-Factor Authentication',
        summary: 'Add a second step to every sign-in.',
        minutes: 4,
        xp: 30,
        difficulty: 'Core',
        icon: ShieldCheck,
        steps: [
          'Open Settings and find the Security panel.',
          'Enrol two-factor authentication and scan the QR code with an authenticator app.',
          'Enter the 6-digit code to confirm; from then on sign-ins need your password and a fresh code.',
        ],
        proTip: 'Any TOTP app works: Google Authenticator, Authy, 1Password or Microsoft Authenticator.',
      },
      {
        id: 'install-app',
        title: 'Install Spyda as an App',
        summary: 'Open Spyda from your home screen or desktop like a native app.',
        minutes: 2,
        xp: 20,
        difficulty: 'Starter',
        icon: Smartphone,
        steps: [
          'Press Install app in the sidebar (Chrome, Edge, Android).',
          'On iPhone or iPad, use Share → Add to Home Screen in Safari.',
          'The installed app opens in its own window and updates itself.',
        ],
      },
    ],
  },
]

/* ═══════════════════════════════════════════════
   Gamification: XP, ranks, and persistence
   ═══════════════════════════════════════════════ */

const GUIDES_PROGRESS_KEY = 'spyda.guides.progress.v1'

const RANK_STEPS = [
  { share: 0, name: 'Hatchling', blurb: 'Every spider starts somewhere.' },
  { share: 0.2, name: 'Silk Spinner', blurb: 'The first threads are holding.' },
  { share: 0.45, name: 'Web Weaver', blurb: 'Chat, canvas and video, connected.' },
  { share: 0.7, name: 'Orb Architect', blurb: 'Downloads, marketplace and rewards mastered.' },
  { share: 0.95, name: 'Spyda Master', blurb: 'The whole web is yours.' },
]

const ALL_GUIDES = GUIDE_SECTIONS.flatMap(section => section.guides)
const TOTAL_XP = ALL_GUIDES.reduce((sum, guide) => sum + guide.xp, 0)
const RANKS = RANK_STEPS.map(rank => ({ threshold: Math.round(rank.share * TOTAL_XP), name: rank.name, blurb: rank.blurb }))

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
    <article className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-300 ${completed ? 'border-primary/30 bg-primary/[0.035]' : 'border-white/[0.07] bg-surface hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.03]'}`}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100" style={{ backgroundColor: `${accent}14` }} />

      <button type="button" onClick={onToggleExpand} aria-expanded={expanded} className="relative flex flex-1 flex-col p-5 text-left">
        <div className="flex items-start justify-between gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${completed ? 'border-primary/35 bg-primary/[0.1]' : 'border-white/[0.09] bg-surface-raised'}`}>
            {completed ? <Check className="h-[18px] w-[18px] text-primary" strokeWidth={2.4} /> : <GuideIcon className="h-[18px] w-[18px]" strokeWidth={1.7} style={{ color: accent }} />}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${DIFFICULTY_STYLES[guide.difficulty]}`}>{guide.difficulty}</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-surface-raised px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground"><Zap className="h-2.5 w-2.5 text-primary" /> {guide.xp} XP</span>
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
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-surface-raised text-[10px] font-bold" style={{ color: accent }}>{index + 1}</span>
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
              className={`mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-bold transition-colors ${completed ? 'border border-white/[0.1] bg-surface-raised text-muted-foreground hover:bg-white/[0.06] hover:text-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
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
                <BookOpen className="h-3.5 w-3.5" /> Spyda Knowledge base
              </div>
              <h1 className="mt-5 max-w-2xl font-heading text-3xl font-semibold leading-tight sm:text-4xl">Everything Spyda can do, one thread at a time.</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                {ALL_GUIDES.length} short guides cover Spyda AI, Canvas mode, the Video editor, downloads and the compressor, the marketplace and your wallet.
                Spyda is free to use, with no subscriptions: you only spend credits when you download or run AI, from a $1 recharge.
                Mark guides done to earn XP, climb ranks and collect a badge for every track.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {GUIDE_SECTIONS.map(section => {
                  const earned = section.guides.every(guide => completed.has(guide.id))
                  return (
                    <span key={section.id} title={`${section.badgeName} — complete every guide in ${section.title}`} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${earned ? 'border-primary/35 bg-primary/[0.1] text-primary' : 'border-white/[0.08] bg-surface text-muted-foreground/50'}`}>
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
              <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.07] rounded-lg border border-white/[0.07] bg-surface text-center">
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
                    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${badgeEarned ? 'border-primary/35 bg-primary/[0.1] text-primary' : 'border-white/[0.08] bg-surface text-muted-foreground'}`}>
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
          <h2 className="mx-auto mt-4 max-w-xl font-heading text-2xl font-semibold sm:text-3xl">The fastest way to learn Spyda is to make something.</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Attach a flyer in Spyda AI and ask for one change, or open the Video editor and drop in a clip. Using Spyda is free; you only spend credits when you download.</p>
        </footer>
      </div>
    </div>
  )
}
