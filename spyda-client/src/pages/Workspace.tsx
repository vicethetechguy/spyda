import { useState, useRef, useCallback, useEffect, useMemo, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { type AtomBox } from '../lib/design'
import {  } from '../lib/layout-grid'
import type { LegacyBreakdown as BreakdownResult } from '../core/design-document'
import { usePaystackPayment } from 'react-paystack'
import SidebarNav from '../components/ui/dashboard-sidebar'
import ChatView, { type ChatSeed } from '../components/chat/ChatView'
import AmbientField from '../components/AmbientField'
import {
  BrandAssetsView,
  HistoryView,
  ProjectsView,
  TemplatesView,
  type BrandAsset,
  type WorkspaceProject,
} from '../components/workspace/WorkspaceLibraryViews'
import { SecurityPanel, SubscriptionView } from '../components/workspace/WorkspaceAccountViews'
import { WhitepaperView } from '../components/workspace/WorkspaceDocumentationViews'
import { GuidesView } from '../components/workspace/WorkspaceGuidesView'
import { TasksView } from '../components/workspace/WorkspaceTasksView'
import { WalletNotificationCenter } from '../components/workspace/WalletNotificationCenter'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Upload,
  Image,
  Plus,
  Loader2,
  Download,
  RotateCcw,
  ChevronDown,
  X,
  Check,
  Zap,
  Bot,
  ShieldCheck,
  ArrowLeft,
  Search,
  Grid2X2,
  Clock3,
  ArrowUpRight,
  CircleCheck,
  ReceiptText,
  Wallet,
  Send,
  ArrowDownToLine,
  LockKeyhole,
  DollarSign,
  ChevronRight,
  Ticket,
  Layers
} from '../components/ui/icons'
import { Link, useNavigate } from 'react-router-dom'
import { fetchBlob, useDownload } from '../components/DownloadProvider'
import {
  isAdminEmail,
  lookupSpydaWallet,
  redeemCoupon,
  sendCreditsBySpydaId,
  type AdminWalletRecipient,
} from '../lib/admin'
import { getWelcomeRewardClaim, type WelcomeRewardClaim } from '../lib/rewards'
import { getCommunityTaskBadgeCount } from '../lib/community-tasks'
import { formatSpydaCouponCode, formatSpydaWalletId } from '../lib/code-format'
import { parseWalletTransaction, type WalletTransaction } from '../lib/wallet'
import {
  SPYDA_BYOK_ROUND_CREDITS,
  SPYDA_GROQ_GPT_IMAGE_ROUND_CREDITS,
} from '../lib/spyda-api'

/* ═══════════════════════════════════════════════
   AI Model Definitions
   ═══════════════════════════════════════════════ */

type AiModel = {
  id: string
  label: string
  description: string
  provider: string
}

const AI_MODELS: AiModel[] = [
  { id: 'openai', label: 'GPT-Image 2', description: 'OpenAI vision + generation · 30 credits', provider: 'openai' },
  { id: 'groq', label: 'Groq + GPT-Image 2', description: 'Groq analysis, OpenAI generation · 20 credits', provider: 'groq' },
]

type GenerationQaReport = {
  ok?: boolean
  skipped?: boolean
  pending?: boolean
  passed?: boolean
  retried?: boolean
  score?: number
  layoutMatch?: string
  textMatch?: string
  assetMatch?: string
  sizeMatch?: string
  outcome?: string
  creditsSpent?: number
  categoryScores?: Record<string, number>
  approvedChangesApplied?: string[]
  solidFindings?: string[]
  unchangedElementsConfirmed?: string[]
  unapprovedChanges?: string[]
  hardGateFailures?: Array<{ code: string; message: string; region?: string }>
  issues?: string[]
  suggestions?: string[]
  detectedIssues?: string[]
  correctiveEssentials?: string[]
  error?: string
}

type BrandEdits = {
  headingFont: string
  bodyFont: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  visualStyle: string
  essentials: string
  outputSize: string
  applyBrandConstants: boolean
}

type SavedSpydaProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  archived?: boolean
  referencePreview?: string | null
  qaParentPreview?: string | null
  generatedImage?: string | null
  breakdown?: BreakdownResult | null
  atomEdits?: Record<string, AtomEdit>
  brandEdits?: BrandEdits
  qa?: GenerationQaReport | null
}

/* ═══════════════════════════════════════════════
   Main Workspace
   ═══════════════════════════════════════════════ */

type AtomEdit = {
  mode: 'same' | 'customize' | 'delete'
  value: string
  assetName?: string
  assetDataUrl?: string
  /** User-adjusted placement box (percent of the source image); overrides the detected atom box. */
  box?: AtomBox
}

const SAVED_PROJECTS_KEY = 'spyda.savedProjects.v1'

function loadSavedProjects(): SavedSpydaProject[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = window.localStorage.getItem(SAVED_PROJECTS_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export default function Workspace() {
  const navigate = useNavigate()
  // Desktop opens on the icon rail; the full list is one click away.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeId, setActiveId] = useState('canvas')
  const [aiModel, setAiModel] = useState<AiModel>(AI_MODELS[1])
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null)
  const [chatSeed, setChatSeed] = useState<ChatSeed | null>(null)
  const seedChat = useCallback((seed: Omit<ChatSeed, 'key'>) => {
    setChatSeed({ ...seed, key: `${Date.now()}` })
    setActiveId('canvas')
  }, [])
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [profilePic, setProfilePic] = useState<string | null>(null)
  const [walletRefreshKey, setWalletRefreshKey] = useState(0)
  const [welcomeClaim, setWelcomeClaim] = useState<WelcomeRewardClaim | null>(null)
  const [communityTaskBadge, setCommunityTaskBadge] = useState(0)
  const { user, signOut } = useAuth()

  const handleWelcomeClaimChange = useCallback((claim: WelcomeRewardClaim | null) => {
    setWelcomeClaim(claim)
  }, [])

  // The welcome reward lives on the Tasks page; the claim only drives the rail badge.
  // (No popup on load: it flashed open and shut while the claim check ran.)
  useEffect(() => {
    let active = true
    if (!user || isAdminEmail(user.email)) return () => { active = false }
    setWelcomeClaim(null)
    getWelcomeRewardClaim().then(claim => {
      if (active) setWelcomeClaim(claim)
    }).catch(() => undefined)
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!user || isAdminEmail(user.email)) {
      setCommunityTaskBadge(0)
      return
    }

    let active = true
    const load = () => getCommunityTaskBadgeCount().then(count => {
      if (active) setCommunityTaskBadge(count)
    }).catch(() => undefined)
    void load()
    const timer = window.setInterval(load, 30_000)
    const refresh = () => void load()
    window.addEventListener('spyda-community-tasks-updated', refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('spyda-community-tasks-updated', refresh)
    }
  }, [user])

  // Handle logout
  useEffect(() => {
    if (activeId === 'logout') {
      signOut()
    }
  }, [activeId, signOut])

  // Fetch profile picture globally for the sidebar
  useEffect(() => {
    async function loadGlobalProfile() {
      if (!user) return
      try {
        const { data } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .single()
        
        if (data?.avatar_url) {
          setProfilePic(data.avatar_url)
        }
      } catch (err) {
        console.error('Error fetching global profile:', err)
      }
    }
    loadGlobalProfile()
  }, [user])

  const pageTitles: Record<string, string> = {
    canvas: 'Spyda AI',
    gallery: 'Gallery',
    history: 'History',
    tasks: 'Tasks',
    projects: 'Projects',
    'p-active': 'Active Projects',
    'p-archived': 'Archived Projects',
    templates: 'Templates',
    'brand-assets': 'Brand Assets',
    whitepaper: 'Whitepaper',
    guides: 'Knowledge base',
    wallet: 'Wallet',
    fund: 'Fund',
    subscription: 'Pricing & credits',
    settings: 'Settings',
  }

  const activeTitle = pageTitles[activeId] || 'Spyda AI'

  // Opening a saved design starts a chat about its latest version.
  const handleOpenProject = useCallback((project: WorkspaceProject) => {
    const source = project.generatedImage || project.referencePreview
    if (!source) return
    seedChat({ image: source, name: project.name || 'Spyda project', text: 'Keep working on this flyer with me.' })
  }, [seedChat])

  const handleUseBrandAsset = useCallback((asset: BrandAsset) => {
    if (asset.kind === 'image') seedChat({ image: asset.value, name: asset.name, text: `Use my ${asset.name} in my flyer.` })
    if (asset.kind === 'color') seedChat({ text: `Use my brand colour ${asset.value} in my flyer.` })
    if (asset.kind === 'font') seedChat({ text: `Use my brand font ${asset.value} in my flyer.` })
  }, [seedChat])

  const handleUseTemplate = useCallback(async (source: string, name: string) => {
    seedChat({ image: source, name, text: 'Make this template mine: ' })
  }, [seedChat])

  return (
    <div className="relative isolate flex h-[100dvh] bg-background text-foreground font-sans overflow-hidden">
      {/* Depth for the glass chrome. Content below paints over it in DOM order. */}
      <AmbientField />

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/70 z-[55] lg:hidden backdrop-blur-sm" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar. On mobile it is a drawer that must sit above the top bar
          (z-50) and its backdrop, or the bar's title paints through it. */}
      <div className={`fixed inset-y-0 left-0 z-[60] lg:relative lg:z-auto h-full shrink-0 transition-all duration-300 ease-in-out overflow-hidden bg-[#08090a] shadow-[24px_0_60px_rgba(0,0,0,0.55)] lg:shadow-none lg:bg-transparent border-r border-white/[0.06] lg:border-none ${sidebarOpen ? 'w-[260px] translate-x-0' : 'w-[260px] -translate-x-full lg:w-[76px] lg:translate-x-0'}`}>
        <SidebarNav
          className={sidebarOpen ? 'w-[260px] h-full' : 'h-full'}
          compact={!sidebarOpen}
          activeId={activeId}
          taskBadge={(welcomeClaim?.status === 'pending' || welcomeClaim?.status === 'approved' ? 0 : 3) + communityTaskBadge || undefined}
          onSelect={(id) => {
            if (id === 'video') { navigate('/video'); return }
            setActiveId(id)
            if (window.innerWidth < 1024) setSidebarOpen(false)
          }}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Bar */}
        <div className="glass glass-strong relative z-50 h-14 shrink-0 border-b border-white/[0.06] flex items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
              title={sidebarOpen ? 'Close navigation' : 'Open navigation'}
              className="p-2 rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors"
            >
              {sidebarOpen ? <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} /> : <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />}
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline">My Workspace</span>
              <span className="hidden text-muted-foreground/30 sm:inline">/</span>
              <span className="truncate font-semibold text-foreground">{activeTitle}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* The chat draws its history, new-chat and canvas-mode buttons here. */}
            {activeId === 'canvas' && <div ref={setTopbarSlot} className="contents" />}
            {/* AI Model Switcher */}
            <div className="relative">
              <button
                onClick={() => setModelMenuOpen(!modelMenuOpen)}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-surface-raised px-3 text-xs font-medium text-muted-foreground hover:bg-white/[0.06] transition-colors"
              >
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span className="hidden sm:inline">{aiModel.label}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {modelMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModelMenuOpen(false)} />
                  <div className="glass glass-strong glass-blur absolute right-0 top-10 z-50 w-64 rounded-xl border shadow-2xl py-1.5 animate-fade-in">
                    <div className="px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase text-muted-foreground/50">AI Model</div>
                    {AI_MODELS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setAiModel(m); setModelMenuOpen(false) }}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors rounded-lg mx-0 ${
                          aiModel.id === m.id ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-white/[0.04]'
                        }`}
                      >
                        <Bot className={`w-4 h-4 mt-0.5 shrink-0 ${aiModel.id === m.id ? 'text-primary' : 'text-muted-foreground/50'}`} />
                        <div>
                          <div className="text-[13px] font-semibold">{m.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{m.description}</div>
                        </div>
                        {aiModel.id === m.id && <Check className="w-4 h-4 text-primary ml-auto mt-0.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <WalletNotificationCenter userId={user?.id} onOpenWallet={() => setActiveId('wallet')} />
            <button 
              onClick={() => setActiveId('settings')}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 overflow-hidden ring-2 ring-transparent hover:ring-primary/50 transition-all cursor-pointer"
            >
              {profilePic ? (
                <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                "S"
              )}
            </button>
          </div>
        </div>

        {/* Page Content */}
        <div className={`min-h-0 flex-1 flex flex-col ${activeId === 'canvas' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {activeId === 'canvas' && (
            <ChatView
              modelProvider={aiModel.provider}
              headerSlot={topbarSlot}
              seed={chatSeed}
              onOpenWallet={() => setActiveId('wallet')}
            />
          )}
          {activeId === 'gallery' && <GalleryView onNewDesign={() => setActiveId('canvas')} />}
          {activeId === 'history' && <HistoryView onOpenProject={handleOpenProject} onNewDesign={() => setActiveId('canvas')} />}
          {activeId === 'tasks' && <TasksView onClaimChange={handleWelcomeClaimChange} />}
          {['projects', 'p-active', 'p-archived'].includes(activeId) && <ProjectsView initialFilter={activeId === 'p-archived' ? 'archived' : 'active'} onOpenProject={handleOpenProject} onNewDesign={() => setActiveId('canvas')} />}
          {activeId === 'templates' && <TemplatesView onUseTemplate={handleUseTemplate} />}
          {activeId === 'brand-assets' && <BrandAssetsView onUseAsset={handleUseBrandAsset} />}
          {activeId === 'whitepaper' && <WhitepaperView />}
          {activeId === 'guides' && <GuidesView />}
          {activeId === 'wallet' && <WalletView key={walletRefreshKey} onFund={() => setActiveId('fund')} onSend={() => setActiveId('wallet-send')} />}
          {activeId === 'wallet-send' && <AdminWalletSendView onBack={() => { setWalletRefreshKey(k => k + 1); setActiveId('wallet') }} />}
          {activeId === 'fund' && <FundView onBack={() => { setWalletRefreshKey(k => k + 1); setActiveId('wallet') }} />}
          {activeId === 'subscription' && <SubscriptionView onBack={() => setActiveId('settings')} onOpenWallet={() => setActiveId('wallet')} onOpenSettings={() => setActiveId('settings')} />}
          {activeId === 'settings' && <SettingsView profilePic={profilePic} setProfilePic={setProfilePic} onManageSubscription={() => setActiveId('subscription')} />}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Other Views (Gallery, Wallet, Settings)
   ═══════════════════════════════════════════════ */

type GalleryFilter = 'all' | 'generated' | 'draft'

function GalleryView({ onNewDesign }: { onNewDesign: () => void }) {
  const saveFile = useDownload()
  const [projects, setProjects] = useState<SavedSpydaProject[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<GalleryFilter>('all')

  useEffect(() => {
    const savedProjects = loadSavedProjects()
    if (!savedProjects.length && import.meta.env.DEV && import.meta.env.VITE_DEV_PREVIEW === 'true') {
      const now = new Date().toISOString()
      setProjects([
        { id: 'preview-1', name: 'Fintech campaign', createdAt: now, updatedAt: now, generatedImage: '/assets/spyda-sample-04.jpeg' },
        { id: 'preview-2', name: 'Product launch', createdAt: now, updatedAt: now, generatedImage: '/assets/spyda-sample-03.jpeg', qa: { score: 92 } },
        { id: 'preview-3', name: 'Subscription offer', createdAt: now, updatedAt: now, referencePreview: '/assets/spyda-sample-08.jpeg' },
        { id: 'preview-4', name: 'App campaign', createdAt: now, updatedAt: now, generatedImage: '/assets/spyda-sample-06.jpeg', qa: { score: 88 } },
      ])
      return
    }
    setProjects(savedProjects)
  }, [])

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return projects.filter(project => {
      const matchesQuery = !normalizedQuery || project.name.toLowerCase().includes(normalizedQuery)
      const matchesFilter = filter === 'all'
        || (filter === 'generated' && Boolean(project.generatedImage))
        || (filter === 'draft' && !project.generatedImage)
      return matchesQuery && matchesFilter
    })
  }, [filter, projects, query])

  const generatedCount = projects.filter(project => project.generatedImage).length
  const downloadName = (project: SavedSpydaProject) => {
    const baseName = project.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'spyda-design'
    const preview = project.generatedImage || project.referencePreview || ''
    const extension = /^(data:image\/jpe?g)|\.jpe?g(?:$|\?)/i.test(preview)
      ? 'jpg'
      : /^(data:image\/webp)|\.webp(?:$|\?)/i.test(preview)
        ? 'webp'
        : 'png'
    return `${baseName}.${extension}`
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
            <Grid2X2 className="h-3.5 w-3.5 text-primary" />
            {projects.length} saved design{projects.length !== 1 ? 's' : ''}
          </div>
          <h2 className="font-heading text-2xl font-semibold sm:text-[28px]">Your design library</h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">References, active drafts, and finished Spyda generations in one place.</p>
        </div>
        <button type="button" onClick={onNewDesign} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New design
        </button>
      </div>

      {projects.length > 0 && (
        <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search designs" className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/45" />
          </label>
          <div className="grid grid-cols-3 rounded-lg border border-white/[0.08] bg-surface p-1">
            {([
              { id: 'all', label: 'All', count: projects.length },
              { id: 'generated', label: 'Generated', count: generatedCount },
              { id: 'draft', label: 'Drafts', count: projects.length - generatedCount },
            ] as Array<{ id: GalleryFilter; label: string; count: number }>).map(option => (
              <button key={option.id} type="button" onClick={() => setFilter(option.id)} className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors ${filter === option.id ? 'bg-white/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {option.label} <span className="ml-1 text-[10px] opacity-60">{option.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredProjects.length ? (
        <div className="grid grid-cols-2 gap-3 pb-8 sm:gap-5 lg:gap-6">
          {filteredProjects.map(project => {
            const preview = project.generatedImage || project.referencePreview || ''
            const atomCount = project.breakdown?.design?.editableComponents?.filter(atom => !atom.deleted).length || 0
            return (
              <article key={project.id} className="group min-w-0 overflow-hidden rounded-lg border border-white/[0.07] bg-surface transition-colors hover:border-primary/30">
                <div className="relative aspect-[4/5] overflow-hidden bg-[#101113]">
                  {preview ? <img src={preview} alt={project.name} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center"><Image className="h-10 w-10 text-muted-foreground/30" /></div>}
                  <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/65 px-2 py-1 text-[9px] font-semibold uppercase text-white backdrop-blur-sm sm:left-3 sm:top-3 sm:text-[10px]">
                    {project.generatedImage ? 'Generated' : 'Draft'}
                  </div>
                  <div className="absolute right-2 top-2 flex items-center gap-2 sm:right-3 sm:top-3">
                    {typeof project.qa?.score === 'number' && <div className="hidden rounded-md border border-primary/20 bg-black/65 px-2 py-1 text-[10px] font-semibold text-primary backdrop-blur-sm sm:block">{project.qa.score}% match</div>}
                    {project.breakdown && <Link to={`/editor/${encodeURIComponent(project.id)}`} aria-label={`Edit layers of ${project.name}`} title="Edit layers" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/65 text-white transition-colors hover:bg-black/85"><Layers className="h-4 w-4" /></Link>}
                    {preview && <button type="button" onClick={() => { void saveFile({ name: downloadName(project), kind: 'image', title: 'Download your design', produce: () => fetchBlob(preview) }) }} aria-label={`Download ${project.name}`} title="Download design" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/65 text-white transition-colors hover:bg-black/85"><Download className="h-4 w-4" /></button>}
                  </div>
                </div>
                <div className="p-3 sm:p-4">
                  <h3 className="truncate font-heading text-sm font-semibold sm:text-base">{project.name}</h3>
                  <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground sm:text-xs">
                    <span className="truncate">{atomCount} atom{atomCount !== 1 ? 's' : ''}</span>
                    <span className="inline-flex shrink-0 items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(project.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="border-b border-dashed border-white/[0.09] py-16 text-center">
          <Grid2X2 className="mx-auto mb-4 h-9 w-9 text-primary/60" />
          <h3 className="font-heading text-lg font-semibold">{projects.length ? 'No matching designs' : 'Your gallery is ready'}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{projects.length ? 'Try a different search or gallery filter.' : 'Create a design and Spyda will keep its reference, atoms, and generated output here.'}</p>
          {!projects.length && <button type="button" onClick={onNewDesign} className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/15"><Plus className="h-4 w-4" /> Start a design</button>}
        </div>
      )}
    </div>
  )
}

type CreditTier = {
  amountUSD: number
  credits: number
  label: string
  title: string
  detail: string
  recommended?: boolean
}

function SpydaCreditIcon({ className = '' }: { className?: string }) {
  return <img src="/assets/spyda-credit.png" alt="" aria-hidden="true" className={`shrink-0 object-contain ${className}`} />
}

const CREDIT_TIERS: CreditTier[] = [
  { amountUSD: 1, credits: 100, label: '$1', title: 'Quick start', detail: 'Enough for one download' },
  { amountUSD: 5, credits: 500, label: '$5', title: 'Starter', detail: 'For focused edits and quick experiments' },
  { amountUSD: 10, credits: 1000, label: '$10', title: 'Creator', detail: 'For regular design reconstruction', recommended: true },
  { amountUSD: 25, credits: 2800, label: '$25', title: 'Studio', detail: 'Extra credits for production work' },
]

function WalletView({ onFund, onSend }: { onFund: () => void; onSend: () => void }) {
  const { user } = useAuth()
  const isAdmin = isAdminEmail(user?.email)
  const [balance, setBalance] = useState(0)
  // A download (or anything else) that spends credits announces the new balance.
  useEffect(() => {
    const onWallet = (event: Event) => { const next = (event as CustomEvent<{ balance?: number }>).detail?.balance; if (typeof next === 'number') setBalance(next) }
    window.addEventListener('spyda:wallet', onWallet)
    return () => window.removeEventListener('spyda:wallet', onWallet)
  }, [])
  const [tokenBalance, setTokenBalance] = useState(0)
  const [creditsSpent, setCreditsSpent] = useState(0)
  const [byokEnabled, setByokEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [balanceError, setBalanceError] = useState('')
  const [activities, setActivities] = useState<WalletTransaction[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')
  const [activityLimit, setActivityLimit] = useState(20)
  const [activityTotal, setActivityTotal] = useState(0)
  const [activeAsset, setActiveAsset] = useState<'credits' | 'usd' | 'token'>('credits')
  const [walletNotice, setWalletNotice] = useState('')

  const loadBalance = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('wallet_balance, openai_key, spyda_token_balance, credits_spent_total')
        .eq('id', user.id)
        .maybeSingle()

      if (error) throw error
      if (data) {
        setBalance(Number(data.wallet_balance || 0))
        setByokEnabled(Boolean(String(data.openai_key || '').trim()))
        setTokenBalance(Number(data.spyda_token_balance || 0))
        setCreditsSpent(Number(data.credits_spent_total || 0))
      }
      setBalanceError('')
    } catch (err) {
      console.error('Error fetching balance:', err)
      setBalanceError('We could not refresh your balance. Try again shortly.')
    } finally {
      setLoading(false)
    }
  }, [user])

  const loadActivity = useCallback(async () => {
    if (!user) {
      setActivities([])
      setActivityLoading(false)
      return
    }
    setActivityLoading(true)
    try {
      const { data, error, count } = await supabase
        .from('credit_transactions')
        .select('id, activity_type, source, description, amount, balance_after, created_at', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(0, activityLimit - 1)

      if (error) throw error
      setActivities((data ?? []).map(parseWalletTransaction))
      setActivityTotal(Number(count || 0))
      setActivityError('')
    } catch (error) {
      console.error('Error fetching wallet activity:', error)
      setActivityError('Credit activity could not be loaded. Refresh after the wallet ledger is connected.')
    } finally {
      setActivityLoading(false)
    }
  }, [activityLimit, user])

  const refreshWallet = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadBalance(), loadActivity()])
    setLastRefreshedAt(new Date())
    setRefreshing(false)
  }, [loadActivity, loadBalance])

  useEffect(() => {
    void refreshWallet()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshWallet()
    }
    const refreshTimer = window.setInterval(() => void refreshWallet(), 30_000)
    const walletChannel = user
      ? supabase
          .channel(`wallet-live-${user.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
            payload => {
              const profile = payload.new as Record<string, unknown>
              setBalance(Number(profile.wallet_balance || 0))
              setTokenBalance(Number(profile.spyda_token_balance || 0))
              setCreditsSpent(Number(profile.credits_spent_total || 0))
              setLastRefreshedAt(new Date())
            },
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'credit_transactions', filter: `user_id=eq.${user.id}` },
            payload => {
              const transaction = parseWalletTransaction(payload.new)
              setActivities(current => {
                const exists = current.some(item => item.id === transaction.id)
                if (!exists) setActivityTotal(total => total + 1)
                return [
                  transaction,
                  ...current.filter(item => item.id !== transaction.id),
                ].slice(0, activityLimit)
              })
              setBalance(transaction.balance_after)
              setLastRefreshedAt(new Date())
            },
          )
          .subscribe()
      : null

    const onFocus = () => void refreshWallet()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (walletChannel) void supabase.removeChannel(walletChannel)
    }
  }, [activityLimit, refreshWallet, user])

  const CREDITS_PER_GENERATION = byokEnabled ? SPYDA_BYOK_ROUND_CREDITS : SPYDA_GROQ_GPT_IMAGE_ROUND_CREDITS
  const generationsRemaining = Math.floor(balance / CREDITS_PER_GENERATION)
  const fiatBalance = Number(user?.user_metadata?.spyda_fiat_balance || 0)
  const creditsToNextToken = 1000 - (creditsSpent % 1000)
  const walletId = user?.id ? `SPY-${user.id.slice(0, 4).toUpperCase()}-${user.id.slice(-4).toUpperCase()}` : 'SPY-GUEST'

  const assets = {
    credits: {
      id: 'credits' as const,
      name: 'Spyda Credits',
      shortName: 'Credits',
      value: balance.toLocaleString(),
      suffix: 'credits',
      status: balance.toLocaleString(),
      detail: 'Used for reconstruction, AI rounds, and design QA.',
      icon: <SpydaCreditIcon className="h-5 w-5" />,
    },
    usd: {
      id: 'usd' as const,
      name: 'USD Wallet',
      shortName: 'US Dollar',
      value: fiatBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      suffix: 'USD',
      status: '0',
      detail: 'Web2 settlement balance for funding and payouts.',
      icon: <DollarSign className="h-5 w-5" />,
    },
    token: {
      id: 'token' as const,
      name: 'Spyda Token',
      shortName: 'Token',
      value: tokenBalance.toLocaleString(),
      suffix: 'tokens',
      status: tokenBalance > 0 ? tokenBalance.toLocaleString() : 'Locked',
      detail: `Earn 1 Spyda Token for every 1,000 credits you spend. ${creditsToNextToken.toLocaleString()} credits until your next token.`,
      icon: <SpydaCreditIcon className="h-5 w-5" />,
    },
  }
  const selectedAsset = assets[activeAsset]

  const handleWalletAction = (action: 'fund' | 'withdraw') => {
    if (action === 'fund') {
      onFund()
      return
    }
    setWalletNotice(activeAsset === 'token'
      ? 'Spyda Token withdrawals are locked until the network, custody, and compliance rails are active.'
      : activeAsset === 'usd'
        ? 'USD withdrawals will activate after payout verification and settlement rails are live.'
        : 'Spyda Credits are platform utility credits and cannot be withdrawn as cash.')
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

      <div className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.72fr)] lg:py-8">
        <section className="min-w-0">
          <div className="group relative min-h-[288px] overflow-hidden rounded-2xl border border-white/[0.14] p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.12)] sm:p-7">
            {/* Layered card surface */}
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#0a0d0c_0%,#0f1d17_34%,#153826_62%,#1d5a38_86%,#2f8f55_112%)]" />
            <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-primary/[0.22] blur-[110px]" />
            <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#88a8ff]/[0.12] blur-[110px]" />
            <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:46px_46px]" />
            <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_32%,rgba(255,255,255,.07)_46%,transparent_58%)] transition-transform duration-700 group-hover:translate-x-10" />
            <img src="/assets/spyda-credit.png" alt="" aria-hidden="true" className="absolute -bottom-14 -right-10 h-60 w-60 rotate-[18deg] object-contain opacity-[0.07]" />

            <div className="relative flex h-full min-h-[238px] flex-col justify-between">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">{selectedAsset.name}</p>
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.18] bg-white/[0.08] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,.15)]">{selectedAsset.icon}</span>
                    <span className="text-sm font-medium text-white/85">{selectedAsset.shortName}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span aria-live="polite" className="hidden text-[9px] uppercase tracking-wide text-white/45 sm:block">
                    {refreshing ? 'Syncing' : lastRefreshedAt ? 'Live' : 'Connecting'}
                  </span>
                  <button type="button" onClick={() => void refreshWallet()} disabled={refreshing} aria-label="Refresh balance and activity" title={lastRefreshedAt ? `Last updated ${lastRefreshedAt.toLocaleTimeString()}` : 'Refresh wallet'} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.18] bg-white/[0.08] text-white/80 backdrop-blur-sm transition-colors hover:bg-white/[0.16] disabled:opacity-60">
                    <RotateCcw className={`h-4 w-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="my-6 flex items-end justify-between gap-4">
                <div>
                  <p className="font-heading text-4xl font-semibold leading-none tracking-tight sm:text-[52px]">{loading && activeAsset === 'credits' ? <Loader2 className="h-9 w-9 animate-spin" /> : selectedAsset.value}</p>
                  <p className="mt-2.5 text-sm font-medium text-white/60">{selectedAsset.suffix}</p>
                </div>
                {/* Card chip */}
                <div aria-hidden="true" className="hidden h-9 w-12 shrink-0 overflow-hidden rounded-md border border-[#e8c87a]/40 bg-[linear-gradient(140deg,#d9b25c_0%,#f3dc9a_45%,#b98f3e_100%)] opacity-90 shadow-[inset_0_1px_2px_rgba(255,255,255,.5)] sm:block">
                  <div className="h-full w-full [background-image:linear-gradient(rgba(0,0,0,.28)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,.28)_1px,transparent_1px)] [background-size:8px_7px] [background-position:center]" />
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-4 text-[11px] text-white/55 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="uppercase tracking-[0.14em]">Wallet ID</p><p className="mt-1 font-mono text-xs font-medium tracking-[0.14em] text-white/90">{walletId}</p></div>
                <div className="sm:text-right"><p className="uppercase tracking-[0.14em]">Account</p><p className="mt-1 max-w-[230px] truncate font-medium text-white/90">{user?.email || 'Signed out'}</p></div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => handleWalletAction('fund')} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"><ArrowDownToLine className="h-4 w-4" /> Fund</button>
            {isAdmin ? (
              <button type="button" onClick={onSend} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-surface-raised text-sm font-semibold transition-colors hover:border-primary/30 hover:bg-primary/[0.08] hover:text-primary"><Send className="h-4 w-4" /> Send</button>
            ) : (
              <button type="button" disabled title="Spyda Credit transfers are available to the administrator only." className="inline-flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-surface text-sm font-semibold text-muted-foreground"><LockKeyhole className="h-4 w-4" /> Send</button>
            )}
            <button type="button" onClick={() => handleWalletAction('withdraw')} aria-disabled={activeAsset === 'token'} className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors ${activeAsset === 'token' ? 'cursor-not-allowed border-white/[0.06] bg-surface text-muted-foreground' : 'border-white/[0.09] bg-surface-raised hover:bg-white/[0.07]'}`}>
              {activeAsset === 'token' ? <LockKeyhole className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />} Withdraw
            </button>
          </div>

          {walletNotice && <div role="status" className="mt-3 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/[0.055] p-4 text-sm leading-6 text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{walletNotice}</span><button type="button" aria-label="Dismiss wallet notice" onClick={() => setWalletNotice('')} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>}

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-heading text-base font-semibold">Your assets</h3><span className="text-[10px] font-semibold uppercase text-muted-foreground">Select to inspect</span></div>
            <div className="grid gap-2 md:grid-cols-3">
              {Object.values(assets).map(asset => (
                <button key={asset.id} type="button" onClick={() => { setActiveAsset(asset.id); setWalletNotice('') }} aria-pressed={activeAsset === asset.id} className={`min-h-[146px] rounded-lg border p-4 text-left transition-colors ${activeAsset === asset.id ? 'border-primary/45 bg-primary/[0.06]' : 'border-white/[0.08] bg-surface hover:border-white/[0.16]'}`}>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-primary">{asset.icon}</span>
                    <span className="text-lg font-semibold text-foreground">{asset.status}</span>
                  </div>
                  <p className="mt-4 text-sm font-semibold">{asset.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{asset.detail}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <section className="rounded-lg border border-white/[0.08] bg-surface p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-heading text-base font-semibold">Wallet activity</h3><p className="mt-1 text-[10px] uppercase text-muted-foreground">{activityTotal.toLocaleString()} transaction{activityTotal === 1 ? '' : 's'}</p></div><ReceiptText className="h-4 w-4 text-muted-foreground" /></div>
            {activityLoading && !activities.length ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : activityError ? (
              <div className="mt-5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4 text-xs leading-5 text-amber-200">{activityError}</div>
            ) : activities.length ? (
              <div className="mt-4 max-h-[390px] overflow-y-auto border-y border-white/[0.07] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {activities.map(activity => {
                  const incoming = activity.amount > 0
                  const sourceLabel = activity.source.replaceAll('_', ' ')
                  return (
                    <div key={activity.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 border-b border-white/[0.06] py-3 last:border-b-0">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${incoming ? 'border-primary/20 bg-primary/[0.08] text-primary' : 'border-[#ff8f5c]/20 bg-[#ff8f5c]/[0.06] text-[#ffab84]'}`}>
                        {incoming ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold" title={activity.description}>{activity.description}</p>
                        <p className="mt-1 truncate text-[10px] capitalize text-muted-foreground">{sourceLabel} / {new Date(activity.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">Balance: {activity.balance_after.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-semibold ${incoming ? 'text-primary' : 'text-[#ffab84]'}`}>{incoming ? '+' : ''}{activity.amount.toLocaleString()}</p>
                        <p className="mt-1 text-[9px] uppercase text-muted-foreground">{activity.activity_type}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-7 border-b border-dashed border-white/[0.1] pb-7 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-surface-raised"><Wallet className="h-4 w-4 text-primary" /></div><p className="mt-3 text-sm font-semibold">No credit activity yet</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Funding, generation spending, and marketplace earnings will appear here.</p></div>
            )}
            {activities.length < activityTotal && <button type="button" onClick={() => setActivityLimit(limit => limit + 20)} disabled={activityLoading} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] text-xs font-semibold text-muted-foreground hover:bg-white/[0.04] hover:text-foreground disabled:opacity-50">{activityLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Load older activity</button>}
            <button type="button" onClick={onFund} className="mt-4 flex w-full items-center justify-between text-sm font-semibold text-primary">Fund your credit balance <ChevronRight className="h-4 w-4" /></button>
          </section>

          <section className="rounded-lg border border-white/[0.08] bg-surface p-5">
            <div className="flex items-center justify-between"><h3 className="font-heading text-base font-semibold">Usage economics</h3><Zap className="h-4 w-4 text-primary" /></div>
            <div className="mt-5 space-y-4">
              <div className="flex items-end justify-between gap-3 border-b border-white/[0.07] pb-4"><div><p className="text-xs text-muted-foreground">Groq + GPT-Image 2</p><p className="mt-1 text-sm font-semibold">20 credits</p></div><span className="text-[10px] uppercase text-muted-foreground">per round</span></div>
              <div className="flex items-end justify-between gap-3 border-b border-white/[0.07] pb-4"><div><p className="text-xs text-muted-foreground">GPT-Image 2 only</p><p className="mt-1 text-sm font-semibold">30 credits</p></div><span className="text-[10px] uppercase text-muted-foreground">per round</span></div>
              <div className="flex items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">Bring your own key</p><p className="mt-1 text-sm font-semibold">5 credits</p></div><span className="text-[10px] uppercase text-muted-foreground">per round</span></div>
            </div>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">Your current balance supports about {generationsRemaining.toLocaleString()} generation{generationsRemaining !== 1 ? 's' : ''} at the active {byokEnabled ? 'BYOK' : 'managed'} rate.</p>
          </section>

          <section className="rounded-lg border border-white/[0.08] bg-surface p-5">
            <div className="flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10"><LockKeyhole className="h-4 w-4 text-primary" /></div><div><p className="text-sm font-semibold">Token withdrawal locked</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Unlocking depends on network, custody, security, and jurisdiction readiness. Spyda will never imply token liquidity before those gates pass.</p></div></div>
          </section>
        </aside>
      </div>

      {balanceError && <p className="pb-8 text-sm text-amber-400">{balanceError}</p>}
    </div>
  )
}

function AdminWalletSendView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const isAdmin = isAdminEmail(user?.email)
  const [balance, setBalance] = useState(0)
  // A download (or anything else) that spends credits announces the new balance.
  useEffect(() => {
    const onWallet = (event: Event) => { const next = (event as CustomEvent<{ balance?: number }>).detail?.balance; if (typeof next === 'number') setBalance(next) }
    window.addEventListener('spyda:wallet', onWallet)
    return () => window.removeEventListener('spyda:wallet', onWallet)
  }, [])
  const [loadingBalance, setLoadingBalance] = useState(true)
  const [recipientSpydaId, setRecipientSpydaId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [lookingUpRecipient, setLookingUpRecipient] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [recipientPreview, setRecipientPreview] = useState<AdminWalletRecipient | null>(null)
  const [receipt, setReceipt] = useState<{
    spydaId: string
    recipientEmail: string
    amount: number
    adminBalance: number
    recipientBalance: number
    transferId: string | null
  } | null>(null)

  const loadBalance = useCallback(async () => {
    if (!user || !isAdmin) {
      setLoadingBalance(false)
      return
    }
    try {
      const { data, error: balanceError } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user.id)
        .maybeSingle()
      if (balanceError) throw balanceError
      setBalance(Number(data?.wallet_balance || 0))
    } catch (balanceError) {
      console.error('Error loading admin wallet balance:', balanceError)
      setError('The admin wallet balance could not be loaded.')
    } finally {
      setLoadingBalance(false)
    }
  }, [isAdmin, user])

  useEffect(() => {
    void loadBalance()
  }, [loadBalance])

  const normalizedSpydaId = recipientSpydaId.trim().toUpperCase()
  const transferAmount = Number(amount)
  const validSpydaId = /^SPY-[A-F0-9]{4}-[A-F0-9]{4}$/.test(normalizedSpydaId)
  const validAmount = Number.isInteger(transferAmount) && transferAmount > 0 && transferAmount <= balance

  const reviewTransfer = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!validSpydaId) {
      setError('Enter a valid recipient ID in the format SPY-XXXX-XXXX.')
      return
    }
    if (!Number.isInteger(transferAmount) || transferAmount < 1) {
      setError('Enter a whole number of Spyda Credits.')
      return
    }
    if (transferAmount > balance) {
      setError('The admin wallet does not have enough Spyda Credits for this transfer.')
      return
    }
    setLookingUpRecipient(true)
    try {
      const recipient = await lookupSpydaWallet(normalizedSpydaId)
      setRecipientPreview(recipient)
      setReviewing(true)
    } catch (lookupError) {
      setRecipientPreview(null)
      setError(lookupError instanceof Error ? lookupError.message : 'The recipient wallet could not be verified.')
    } finally {
      setLookingUpRecipient(false)
    }
  }

  const confirmTransfer = async () => {
    if (!validSpydaId || !validAmount || sending) return
    setSending(true)
    setError('')
    try {
      const result = await sendCreditsBySpydaId(normalizedSpydaId, transferAmount, note)
      if (result.sender_balance !== null) {
        setBalance(result.sender_balance)
      } else {
        await loadBalance()
      }
      setReceipt({
        spydaId: result.spyda_id,
        recipientEmail: result.recipient_email || recipientPreview?.email || '',
        amount: transferAmount,
        adminBalance: result.sender_balance ?? Math.max(0, balance - transferAmount),
        recipientBalance: result.new_balance,
        transferId: result.transfer_id,
      })
      setReviewing(false)
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : 'The transfer could not be completed.')
      setReviewing(false)
      await loadBalance()
    } finally {
      setSending(false)
    }
  }

  const resetTransfer = () => {
    setRecipientSpydaId('')
    setAmount('')
    setNote('')
    setError('')
    setReviewing(false)
    setRecipientPreview(null)
    setReceipt(null)
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center px-4 py-10">
        <div className="w-full rounded-xl border border-white/[0.08] bg-surface p-7 text-center">
          <LockKeyhole className="mx-auto h-7 w-7 text-muted-foreground" />
          <h2 className="mt-4 font-heading text-xl font-semibold">Admin transfer only</h2>
          <p className="mt-2 text-sm text-muted-foreground">Only admin@spydadesigns.xyz can send Spyda Credits directly to another wallet.</p>
          <button type="button" onClick={onBack} className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.1] px-4 text-sm font-semibold hover:bg-white/[0.05]"><ArrowLeft className="h-4 w-4" /> Back to Wallet</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to Wallet</button>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-xl border border-white/[0.09] bg-surface p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Send className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Admin wallet transfer</p>
              <h2 className="mt-1 font-heading text-2xl font-semibold">Send Spyda Credits</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Transfer credits directly from the Spyda admin wallet to a user’s wallet.</p>
            </div>
          </div>

          {receipt ? (
            <div className="mt-8">
              <div className="rounded-xl border border-primary/25 bg-primary/[0.055] p-6 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary"><CircleCheck className="h-6 w-6" /></span>
                <h3 className="mt-4 font-heading text-xl font-semibold">Transfer complete</h3>
                <p className="mt-2 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{receipt.amount.toLocaleString()} credits</span> were sent to <span className="font-mono text-primary">{receipt.spydaId}</span>.</p>
                {receipt.recipientEmail && <p className="mt-2 text-xs text-muted-foreground">Recipient: {receipt.recipientEmail}</p>}
                <div className="mt-5 grid grid-cols-2 gap-2 text-left">
                  <div className="rounded-lg border border-white/[0.08] bg-black/15 p-3"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Recipient balance</p><p className="mt-1 text-sm font-semibold text-primary">{receipt.recipientBalance.toLocaleString()}</p></div>
                  <div className="rounded-lg border border-white/[0.08] bg-black/15 p-3"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Admin balance</p><p className="mt-1 text-sm font-semibold">{receipt.adminBalance.toLocaleString()}</p></div>
                </div>
                {receipt.transferId && <p className="mt-3 font-mono text-[9px] text-muted-foreground">Receipt {receipt.transferId}</p>}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={resetTransfer} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Send className="h-4 w-4" /> Send another</button>
                <button type="button" onClick={onBack} className="inline-flex h-11 items-center justify-center rounded-lg border border-white/[0.1] px-4 text-sm font-semibold hover:bg-white/[0.05]">Return to Wallet</button>
              </div>
            </div>
          ) : reviewing ? (
            <div className="mt-8">
              <h3 className="font-heading text-lg font-semibold">Review transfer</h3>
              <div className="mt-4 overflow-hidden rounded-lg border border-white/[0.09]">
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4"><span className="text-sm text-muted-foreground">Recipient</span><span className="font-mono text-sm font-semibold text-primary">{normalizedSpydaId}</span></div>
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4"><span className="text-sm text-muted-foreground">Account</span><span className="max-w-[65%] truncate text-right text-sm font-semibold">{recipientPreview?.email || 'Verified Spyda account'}</span></div>
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4"><span className="text-sm text-muted-foreground">Current recipient balance</span><span className="text-sm font-semibold">{(recipientPreview?.current_balance || 0).toLocaleString()} credits</span></div>
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4"><span className="text-sm text-muted-foreground">Recipient balance after</span><span className="text-sm font-semibold text-primary">{((recipientPreview?.current_balance || 0) + transferAmount).toLocaleString()} credits</span></div>
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4"><span className="text-sm text-muted-foreground">Amount</span><span className="font-heading text-lg font-semibold">{transferAmount.toLocaleString()} credits</span></div>
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4"><span className="text-sm text-muted-foreground">Admin balance after</span><span className="text-sm font-semibold">{(balance - transferAmount).toLocaleString()} credits</span></div>
                <div className="flex items-start justify-between gap-4 px-4 py-4"><span className="text-sm text-muted-foreground">Note</span><span className="max-w-[65%] text-right text-sm">{note.trim() || 'No note'}</span></div>
              </div>
              {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setReviewing(false)} disabled={sending} className="inline-flex h-11 items-center justify-center rounded-lg border border-white/[0.1] px-4 text-sm font-semibold hover:bg-white/[0.05] disabled:opacity-50">Edit transfer</button>
                <button type="button" onClick={() => void confirmTransfer()} disabled={sending} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Sending…' : 'Confirm and send'}</button>
              </div>
            </div>
          ) : (
            <form onSubmit={reviewTransfer} className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold">Recipient Spyda ID</span>
                <input value={recipientSpydaId} onChange={event => { setRecipientSpydaId(formatSpydaWalletId(event.target.value)); setRecipientPreview(null); setError('') }} autoComplete="off" spellCheck={false} maxLength={13} placeholder="SPY-XXXX-XXXX" className="h-12 w-full rounded-lg border border-white/[0.1] bg-background/60 px-4 font-mono text-sm uppercase tracking-wide outline-none focus:border-primary/55" />
                <span className="mt-2 block text-xs text-muted-foreground">The user can find this ID on their Spyda Wallet card.</span>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold">Amount</span>
                <div className="relative">
                  <input type="number" min="1" max={Math.max(1, balance)} step="1" inputMode="numeric" value={amount} onChange={event => { setAmount(event.target.value); setError('') }} placeholder="Enter credits" className="h-12 w-full rounded-lg border border-white/[0.1] bg-background/60 px-4 pr-24 text-sm outline-none focus:border-primary/55" />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">Credits</span>
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold">Transfer note <span className="font-normal text-muted-foreground">(optional)</span></span>
                <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={120} rows={3} placeholder="Reason for this transfer" className="w-full resize-none rounded-lg border border-white/[0.1] bg-background/60 px-4 py-3 text-sm leading-6 outline-none focus:border-primary/55" />
                <span className="mt-1 block text-right text-[10px] text-muted-foreground">{note.length}/120</span>
              </label>
              {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={loadingBalance || lookingUpRecipient} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">{lookingUpRecipient ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {lookingUpRecipient ? 'Verifying wallet...' : 'Review transfer'}</button>
            </form>
          )}
        </section>

        <aside className="space-y-3">
          <section className="overflow-hidden rounded-xl border border-white/[0.1] bg-[linear-gradient(145deg,#0d1713_0%,#183c29_65%,#2f8550_125%)] p-5 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Available to send</p>
            <div className="mt-4 flex items-center gap-3"><SpydaCreditIcon className="h-9 w-9" /><div><p className="font-heading text-3xl font-semibold">{loadingBalance ? '—' : balance.toLocaleString()}</p><p className="text-xs text-white/55">Spyda Credits</p></div></div>
            <div className="mt-6 border-t border-white/[0.12] pt-4"><p className="text-[10px] uppercase tracking-wide text-white/50">Sending account</p><p className="mt-1 truncate text-xs font-medium text-white/85">{user?.email}</p></div>
          </section>
          <section className="rounded-lg border border-white/[0.08] bg-surface p-5">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Admin protected</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The database verifies the signed-in admin account before moving credits. Regular accounts cannot call this transfer.</p></div></div>
          </section>
        </aside>
      </div>
    </div>
  )
}

const USD_TO_NGN = 1500

function FundView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [balance, setBalance] = useState(0)
  // A download (or anything else) that spends credits announces the new balance.
  useEffect(() => {
    const onWallet = (event: Event) => { const next = (event as CustomEvent<{ balance?: number }>).detail?.balance; if (typeof next === 'number') setBalance(next) }
    window.addEventListener('spyda:wallet', onWallet)
    return () => window.removeEventListener('spyda:wallet', onWallet)
  }, [])
  const [byokEnabled, setByokEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [balanceError, setBalanceError] = useState('')
  const [selectedTier, setSelectedTier] = useState<CreditTier>(CREDIT_TIERS[1])
  const [customAmount, setCustomAmount] = useState('15')

  useEffect(() => {
    async function fetchBalance() {
      if (!user) {
        setLoading(false)
        return
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('wallet_balance, openai_key')
          .eq('id', user.id)
          .single()

        if (error) throw error
        setBalance(Number(data?.wallet_balance || 0))
        setByokEnabled(Boolean(String(data?.openai_key || '').trim()))
      } catch (err) {
        console.error('Error fetching balance:', err)
        setBalanceError('We could not refresh your balance. Try again shortly.')
      } finally {
        setLoading(false)
      }
    }
    fetchBalance()
  }, [user])

  const CREDITS_PER_GENERATION = byokEnabled ? SPYDA_BYOK_ROUND_CREDITS : SPYDA_GROQ_GPT_IMAGE_ROUND_CREDITS
  const selectedGenerations = Math.floor(selectedTier.credits / CREDITS_PER_GENERATION)
  const localPrice = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(selectedTier.amountUSD * USD_TO_NGN)

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to wallet
      </button>

      <header className="mt-5 flex flex-col gap-4 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-semibold sm:text-[28px]">Fund Spyda Credits</h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">Recharge from just $1: choose a pack or enter any amount. Every $1 adds 100 credits, and there is never a subscription.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/[0.08] bg-surface-raised px-3 py-2 text-xs text-muted-foreground">
          <Wallet className="h-4 w-4 text-primary" /> Current balance:
          <span className="font-semibold text-foreground">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `${balance.toLocaleString()} credits`}</span>
        </div>
      </header>

      <div className="py-6 lg:py-8">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {CREDIT_TIERS.map(tier => {
            const selected = selectedTier.amountUSD === tier.amountUSD && selectedTier.title === tier.title
            return (
              <button key={tier.amountUSD} type="button" onClick={() => setSelectedTier(tier)} aria-pressed={selected} className={`relative min-h-40 rounded-lg border p-5 text-left transition-colors ${selected ? 'border-primary/60 bg-primary/[0.07]' : 'border-white/[0.08] bg-surface hover:border-white/[0.16]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">{tier.title}</p>
                      {tier.recommended && <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">Recommended</span>}
                    </div>
                    <p className="mt-2 font-heading text-3xl font-semibold">{tier.label}</p>
                  </div>
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-white/[0.16]'}`}>{selected && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-primary"><SpydaCreditIcon className="h-4 w-4" /> {tier.credits.toLocaleString()} credits</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{tier.detail}</p>
              </button>
            )
          })}
          <label className={`relative min-h-40 cursor-text rounded-lg border p-5 text-left transition-colors ${selectedTier.title === 'Custom' ? 'border-primary/60 bg-primary/[0.07]' : 'border-white/[0.08] bg-surface hover:border-white/[0.16]'}`}>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Custom amount</p>
            <div className="mt-2 flex items-center gap-2 font-heading text-3xl font-semibold">
              <span>$</span>
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                value={customAmount}
                onFocus={() => {
                  const amount = Math.max(1, Number(customAmount) || 1)
                  setSelectedTier({ amountUSD: amount, credits: Math.round(amount * 100), label: `$${amount}`, title: 'Custom', detail: 'Flexible wallet funding' })
                }}
                onChange={event => {
                  const value = event.target.value
                  const amount = Math.max(1, Math.min(1000, Number(value) || 1))
                  setCustomAmount(value)
                  setSelectedTier({ amountUSD: amount, credits: Math.round(amount * 100), label: `$${amount}`, title: 'Custom', detail: 'Flexible wallet funding' })
                }}
                aria-label="Custom wallet funding amount in dollars"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 font-heading text-3xl font-semibold outline-none"
              />
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-primary"><SpydaCreditIcon className="h-4 w-4" /> {Math.round(Math.max(1, Math.min(1000, Number(customAmount) || 1)) * 100).toLocaleString()} credits</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Fund any amount from $1. Every $1 adds 100 credits.</p>
          </label>
        </div>

        <div className="mt-6 rounded-lg border border-white/[0.08] bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold">{selectedTier.credits.toLocaleString()} credits <span className="font-normal text-muted-foreground">· about {selectedGenerations} generations</span></p><p className="mt-1 text-xs text-muted-foreground">Charged as {localPrice} through Paystack.</p></div>
            <PaystackTopUpButton tier={selectedTier} user={user} balance={balance} setBalance={setBalance} usdToNgn={USD_TO_NGN} />
          </div>
          <div className="mt-5 flex items-start gap-3 border-t border-white/[0.07] pt-5 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Payments are processed securely by Paystack. Your card details are never stored by Spyda.</div>
        </div>

        <CouponRedeemCard onRedeemed={added => setBalance(balance + added)} />

        {balanceError && <p className="mt-6 text-sm text-amber-400">{balanceError}</p>}
      </div>
    </div>
  )
}

function CouponRedeemCard({ onRedeemed }: { onRedeemed: (creditsAdded: number) => void }) {
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'redeeming' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleRedeem = async () => {
    const trimmed = code.trim()
    if (!trimmed) {
      setState('error')
      setMessage('Enter a coupon code to redeem.')
      return
    }
    setState('redeeming')
    setMessage('')
    try {
      const { credit_amount } = await redeemCoupon(trimmed)
      onRedeemed(credit_amount)
      setState('success')
      setMessage(`${credit_amount.toLocaleString()} Spyda credits added to your wallet.`)
      setCode('')
    } catch (err) {
      setState('error')
      setMessage(err instanceof Error ? err.message : 'That coupon code could not be redeemed.')
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/[0.08] bg-surface p-6 pb-7 sm:p-8 sm:pb-9">
      <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase text-primary">
        <Ticket className="h-4 w-4" /> Have a coupon code?
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">Redeem a Spyda coupon to instantly top up your credit balance. Each code works once.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <input
          type="text"
          value={code}
          onChange={event => { setCode(formatSpydaCouponCode(event.target.value)); if (state !== 'idle') { setState('idle'); setMessage('') } }}
          onKeyDown={event => { if (event.key === 'Enter') handleRedeem() }}
          placeholder="SPYDA-XXXX-XXXX"
          maxLength={15}
          autoComplete="off"
          spellCheck={false}
          aria-label="Coupon code"
          className="h-24 w-full flex-1 rounded-md border border-white/[0.12] bg-background/60 px-6 font-mono text-2xl uppercase tracking-[0.18em] outline-none placeholder:tracking-[0.18em] placeholder:text-muted-foreground/60 focus:border-primary/60 sm:h-20 sm:text-xl"
        />
        <button
          type="button"
          onClick={handleRedeem}
          disabled={state === 'redeeming'}
          className="inline-flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-44 sm:text-sm"
        >
          {state === 'redeeming' && <Loader2 className="h-4 w-4 animate-spin" />}
          {state === 'success' && <CircleCheck className="h-4 w-4" />}
          {state === 'redeeming' ? 'Redeeming…' : state === 'success' ? 'Redeemed' : 'Redeem coupon'}
        </button>
      </div>
      {message && (
        <p className={`mt-3 flex items-start gap-2 text-sm ${state === 'error' ? 'text-amber-400' : 'text-primary'}`}>
          {state === 'error' ? <X className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          {message}
        </p>
      )}
    </div>
  )
}

type PaystackTopUpButtonProps = {
  tier: CreditTier
  user: ReturnType<typeof useAuth>['user']
  balance: number
  setBalance: (balance: number) => void
  usdToNgn: number
}

function PaystackTopUpButton({ tier, user, balance, setBalance, usdToNgn }: PaystackTopUpButtonProps) {
  const [paymentState, setPaymentState] = useState<'idle' | 'processing' | 'success' | 'error'>('idle')
  const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || ''
  const config = {
    reference: `${Date.now()}-${tier.amountUSD}`,
    email: user?.email || 'user@spyda.ai',
    amount: tier.amountUSD * usdToNgn * 100,
    publicKey: paystackKey,
    currency: 'NGN'
  }

  const initializePayment = usePaystackPayment(config)

  const handleSuccess = async () => {
    setPaymentState('processing')
    const newBalance = balance + tier.credits

    if (user) {
      const { error } = await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', user.id)
      if (error) {
        console.error('Error updating wallet balance:', error)
        setPaymentState('error')
        return
      }
    }
    setBalance(newBalance)
    setPaymentState('success')
  }

  const handleClose = () => {
    setPaymentState('idle')
  }

  return (
    <button
      type="button"
      disabled={paymentState === 'processing'}
      onClick={() => {
        if (!paystackKey) {
          window.open("https://vigencypromo.xyz", "_blank")
          return
        }
        if (!user) {
          alert("Please log in to add credits.")
          return
        }
        setPaymentState('processing')
        initializePayment({ onSuccess: handleSuccess, onClose: handleClose })
      }}
      className="inline-flex h-11 min-w-48 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {paymentState === 'processing' && <Loader2 className="h-4 w-4 animate-spin" />}
      {paymentState === 'success' && <CircleCheck className="h-4 w-4" />}
      {paymentState === 'error' ? 'Balance update failed' : paymentState === 'success' ? 'Credits added' : !paystackKey ? 'Pay with Vigency' : `Add ${tier.credits.toLocaleString()} credits`}
      {paymentState === 'idle' && <ArrowUpRight className="h-4 w-4" />}
    </button>
  )
}

function SettingsView({ profilePic, setProfilePic, onManageSubscription }: { profilePic: string | null, setProfilePic: (url: string | null) => void, onManageSubscription: () => void }) {
  const { user } = useAuth()
  const [saved, setSaved] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [formData, setFormData] = useState({
    display_name: 'Spyda User',
    brand_name: '',
    openai_key: '',
    groq_key: ''
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function loadProfile() {
      if (!user) return
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
          
        if (data) {
          setFormData({
            display_name: data.display_name || 'Spyda User',
            brand_name: data.brand_name || '',
            openai_key: data.openai_key || '',
            groq_key: data.groq_key || ''
          })
          if (data.avatar_url) setProfilePic(data.avatar_url)
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
      } finally {
        setLoadingProfile(false)
      }
    }
    loadProfile()
  }, [user, setProfilePic])

  const handleSave = async () => {
    if (!user) return
    try {
      const { error } = await supabase.from('profiles').update({
        display_name: formData.display_name,
        brand_name: formData.brand_name,
        openai_key: formData.openai_key,
        groq_key: formData.groq_key,
        avatar_url: profilePic,
        updated_at: new Date().toISOString()
      }).eq('id', user.id)
      if (!error) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        console.error('Error saving profile:', error.message)
      }
    } catch (e) {
      console.error('Exception saving profile', e)
    }
  }

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    
    // Optimistic UI update
    const tempUrl = URL.createObjectURL(file)
    setProfilePic(tempUrl)
    
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Math.random()}.${fileExt}`
      
      const { error } = await supabase.storage
        .from('avatars')
        .upload(fileName, file)
        
      if (error) throw error
      
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)
        
      setProfilePic(publicUrl)
    } catch (error: any) {
      console.error('Error uploading avatar:', error.message)
      alert("Failed to upload avatar to Supabase. Make sure the 'avatars' storage bucket exists.")
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 border-b border-white/[0.06] pb-6">
        <h2 className="font-heading text-3xl font-bold mb-2 text-foreground">User Profile & Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your personal information, workspace settings, and AI preferences.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-10">
        <div className="space-y-8">
          {/* Profile Section */}
          <div className="rounded-2xl border border-white/[0.06] bg-surface overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/5 to-transparent relative">
            </div>
            <div className="px-8 pb-8 pt-0 relative">
              <div className="flex justify-between items-end mb-6">
                <div className="relative -mt-12 group">
                  <div className="w-24 h-24 rounded-2xl bg-card border-4 border-background flex items-center justify-center overflow-hidden shadow-xl shadow-black/50">
                    {profilePic ? (
                      <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-3xl font-heading font-bold text-primary-foreground">
                        S
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center border-4 border-transparent"
                  >
                    <Upload className="w-6 h-6 text-white" />
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfileUpload} />
                </div>
                <div className="flex gap-3">
                  {profilePic && (
                    <button 
                      onClick={() => setProfilePic(null)}
                      className="text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors px-3 py-2"
                    >
                      Remove
                    </button>
                  )}
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-4 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                  >
                    Change Picture
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Display Name</label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-background border border-white/[0.08] text-sm text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Email Address</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full h-11 px-4 rounded-xl bg-background/50 border border-white/[0.04] text-sm text-muted-foreground cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="rounded-2xl border border-white/[0.06] bg-surface p-8">
            <h3 className="font-heading text-lg font-bold mb-6">Workspace Preferences</h3>
            <div className="space-y-6">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Default Brand Name</label>
                <input
                  type="text"
                  value={formData.brand_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, brand_name: e.target.value }))}
                  placeholder="Enter your brand name"
                  className="w-full h-11 px-4 rounded-xl bg-background border border-white/[0.08] text-sm text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">OpenAI API Key</label>
                <input
                  type="password"
                  value={formData.openai_key}
                  onChange={(e) => setFormData(prev => ({ ...prev, openai_key: e.target.value }))}
                  placeholder="sk-..."
                  className="w-full h-11 px-4 rounded-xl bg-background border border-white/[0.08] text-sm text-foreground font-mono focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                />
                <p className="text-[11px] text-muted-foreground mt-2">Connect your own OpenAI billing to activate the BYOK rate of 5 Spyda credits per AI generation.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Groq API Key (Optional)</label>
                <input
                  type="password"
                  value={formData.groq_key}
                  onChange={(e) => setFormData(prev => ({ ...prev, groq_key: e.target.value }))}
                  placeholder="gsk_..."
                  className="w-full h-11 px-4 rounded-xl bg-background border border-white/[0.08] text-sm text-foreground font-mono focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                />
                <p className="text-[11px] text-muted-foreground mt-2">Speeds up the design dissection process dramatically.</p>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={loadingProfile}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-8 text-sm font-bold text-primary-foreground shadow-[0_8px_24px_rgba(34,197,94,0.2)] transition-all hover:shadow-[0_12px_32px_rgba(34,197,94,0.3)] hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loadingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <><Check className="w-5 h-5" /> Saved Successfully</> : 'Save All Changes'}
            </button>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.06] bg-primary/[0.02] p-6">
            <h4 className="font-heading text-sm font-bold mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Current Plan
            </h4>
            <div className="text-2xl font-heading font-bold text-foreground mb-1">Spyda access</div>
            <p className="text-xs leading-5 text-muted-foreground mb-6">Spyda is free, with no subscription. See what credits pay for and recharge from $1.</p>
            <button type="button" onClick={onManageSubscription} className="w-full inline-flex h-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
              Pricing & credits
            </button>
          </div>

          <SecurityPanel />
        </div>
      </div>
    </div>
  )
}
