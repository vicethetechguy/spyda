import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { parseAtomBox, clampBox, compositeReplacements, getImageSize, refineLogoBox, resizeBoxFromCorner, trimImageWhitespace, type AtomBox, type ResizeCorner } from '../lib/design'
import { buildLayoutGridGuide, type LayoutGridGuide } from '../lib/layout-grid'
import type { LegacyBreakdown as BreakdownResult, LegacyEditableComponent as EditableComponent } from '../core/design-document'
import { usePaystackPayment } from 'react-paystack'
import SidebarNav from '../components/ui/dashboard-sidebar'
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
import {
  PanelLeftClose,
  PanelLeftOpen,
  Upload,
  Sparkles,
  Image,
  Wand2,
  Plus,
  Loader2,
  Download,
  RotateCcw,
  ChevronDown,
  X,
  Check,
  Zap,
  Bot,
  MoreHorizontal,
  Trash2,
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
  Radio,
  ChevronRight,
  Ticket
} from 'lucide-react'
import { redeemCoupon } from '../lib/admin'

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
  { id: 'openai', label: 'GPT-Image 2', description: 'OpenAI vision + generation', provider: 'openai' },
  { id: 'groq', label: 'Groq + GPT-Image 2', description: 'Groq analysis, OpenAI generation', provider: 'groq' },
]

const SPYDA_AI_ROUND_CREDITS = 20
const SPYDA_BYOK_ROUND_CREDITS = 5

type SpydaApiKeys = { openai: string; groq: string }

async function loadSpydaApiKeys(userId?: string): Promise<SpydaApiKeys> {
  if (!userId) return { openai: '', groq: '' }
  const { data, error } = await supabase
    .from('profiles')
    .select('openai_key, groq_key')
    .eq('id', userId)
    .single()
  if (error) return { openai: '', groq: '' }
  return {
    openai: String(data?.openai_key || '').trim(),
    groq: String(data?.groq_key || '').trim(),
  }
}

function apiKeyRequestHeaders(keys: SpydaApiKeys): Record<string, string> {
  return {
    ...(keys.openai ? { 'x-spyda-openai-key': keys.openai } : {}),
    ...(keys.groq ? { 'x-spyda-groq-key': keys.groq } : {}),
  }
}

async function readSpydaCreditBalance(userId?: string): Promise<number | null> {
  if (!userId) return null
  const { data, error } = await supabase.from('profiles').select('wallet_balance').eq('id', userId).single()
  return error ? null : Math.max(0, Number(data?.wallet_balance || 0))
}

async function spendSpydaCredits(userId: string | undefined, amount: number) {
  if (!userId || amount <= 0) return
  const balance = await readSpydaCreditBalance(userId)
  if (balance === null) return
  await supabase.from('profiles').update({ wallet_balance: Math.max(0, balance - amount) }).eq('id', userId)
}

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

type ApiAnalyzeResponse = {
  ok: boolean
  mode?: string
  breakdown?: BreakdownResult
  error?: string
}

type ApiGenerateResponse = {
  ok: boolean
  mode?: string
  model?: string
  image?: string
  qa?: GenerationQaReport
  message?: string
  error?: string
}

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

type GenerationReferenceImage = {
  sectionId: string
  sectionName: string
  sectionType: string
  name: string
  fieldName: string
  dataUrl: string
  originalBoundingBox: string
  originalContent: string
  originalStyle: string
}

function isGenerationReferenceImage(value: GenerationReferenceImage | null): value is GenerationReferenceImage {
  return value !== null
}

const OUTPUT_SIZE_OPTIONS = [
  { value: 'match-reference', label: 'Match uploaded reference', detail: 'Use the uploaded flyer ratio' },
  { value: 'instagram-square-1080x1080', label: 'Instagram Square', detail: '1080 x 1080, 1:1' },
  { value: 'instagram-portrait-1080x1350', label: 'Instagram Portrait', detail: '1080 x 1350, 4:5' },
  { value: 'instagram-story-1080x1920', label: 'Instagram Story/Reel', detail: '1080 x 1920, 9:16' },
  { value: 'facebook-post-1200x630', label: 'Facebook Post', detail: '1200 x 630, 1.91:1' },
  { value: 'facebook-cover-1640x924', label: 'Facebook Cover', detail: '1640 x 924' },
  { value: 'youtube-thumbnail-1280x720', label: 'YouTube Thumbnail', detail: '1280 x 720, 16:9' },
  { value: 'youtube-shorts-1080x1920', label: 'YouTube Shorts', detail: '1080 x 1920, 9:16' },
  { value: 'linkedin-post-1200x1200', label: 'LinkedIn Post', detail: '1200 x 1200, 1:1' },
  { value: 'x-post-1600x900', label: 'X / Twitter Post', detail: '1600 x 900, 16:9' },
  { value: 'web-banner-1920x1080', label: 'Web Banner', detail: '1920 x 1080, 16:9' },
  { value: 'display-banner-3000x1000', label: 'Wide Display Banner', detail: '3000 x 1000, 3:1' },
  { value: 'flyer-portrait-1024x1536', label: 'Flyer Portrait', detail: '1024 x 1536' },
  { value: 'flyer-landscape-1536x1024', label: 'Flyer Landscape', detail: '1536 x 1024' },
  { value: 'a4-portrait-2480x3508', label: 'A4 Portrait', detail: '2480 x 3508' },
  { value: 'a4-landscape-3508x2480', label: 'A4 Landscape', detail: '3508 x 2480' },
]

// Vercel Functions accept 4.5 MB request bodies. Keep multipart uploads below
// 4 MB so field metadata and boundaries have room without reaching the limit.
const SAFE_GENERATION_UPLOAD_BYTES = 4 * 1024 * 1024
const DESIGN_PREVIEW_HEIGHT = 'clamp(360px, 58vh, 620px)'

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/

function normalizeHexColor(value: string, fallback: string) {
  const trimmed = value.trim()
  if (!HEX_COLOR_PATTERN.test(trimmed)) return fallback
  return `#${trimmed.replace('#', '').toUpperCase()}`
}

function formatHexDraft(value: string) {
  const trimmed = value.trim()
  const cleaned = trimmed
    .replace(/[^#0-9a-fA-F]/g, '')
    .replace(/(?!^)#/g, '')

  if (!cleaned) return ''

  const hex = cleaned.startsWith('#') ? cleaned.slice(1, 7) : cleaned.slice(0, 6)
  return `#${hex.toUpperCase()}`
}

function imageFileToDataUrl(file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.86, mimeType = 'image/jpeg'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new window.Image()
      img.src = event.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > height && width > maxWidth) {
          height *= maxWidth / width
          width = maxWidth
        } else if (height > maxHeight) {
          width *= maxHeight / height
          height = maxHeight
        }

        canvas.width = Math.round(width)
        canvas.height = Math.round(height)
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)

        resolve(canvas.toDataURL(mimeType, quality))
      }
      img.onerror = () => reject(new Error('Spyda could not read this uploaded image. Try uploading it again as PNG, JPEG, or WebP.'))
    }
    reader.onerror = () => reject(new Error('Spyda could not read this uploaded image. Try uploading it again.'))
  })
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)
  return response.blob()
}

function imageSourceToBlob(imageSrc: string, maxWidth = 1024, maxHeight = 1024, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    if (!imageSrc.startsWith('data:') && !imageSrc.startsWith('blob:')) {
      img.crossOrigin = 'anonymous'
    }
    img.src = imageSrc
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height)
        height = maxHeight
      }

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not initialize canvas context.'))
        return
      }

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      
      const mimeType = imageSrc.startsWith('data:image/png') || imageSrc.includes('.png') ? 'image/png' : 'image/webp'
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Could not prepare image for generation.'))
      }, mimeType, quality)
    }
    img.onerror = () => reject(new Error('Spyda could not prepare one of the selected images. Re-upload that asset and try again.'))
  })
}

function prepareMaskedGenerationInput(
  imageSrc: string,
  editBoxes: AtomBox[],
  maxWidth = 1024,
  maxHeight = 1536,
): Promise<{ imageBlob: Blob; maskBlob: Blob | null }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    if (!imageSrc.startsWith('data:') && !imageSrc.startsWith('blob:')) img.crossOrigin = 'anonymous'
    img.src = imageSrc
    img.onload = async () => {
      let width = img.naturalWidth || img.width
      let height = img.naturalHeight || img.height
      const scale = Math.min(1, maxWidth / width, maxHeight / height)
      width = Math.max(1, Math.round(width * scale))
      height = Math.max(1, Math.round(height * scale))

      const imageCanvas = document.createElement('canvas')
      imageCanvas.width = width
      imageCanvas.height = height
      const imageContext = imageCanvas.getContext('2d')
      if (!imageContext) {
        reject(new Error('Could not prepare the working design.'))
        return
      }
      imageContext.fillStyle = '#ffffff'
      imageContext.fillRect(0, 0, width, height)
      imageContext.drawImage(img, 0, 0, width, height)

      const toWebp = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolveBlob, rejectBlob) => {
        canvas.toBlob(blob => blob ? resolveBlob(blob) : rejectBlob(new Error('Could not prepare the generation image.')), 'image/webp', quality)
      })

      try {
        const imageBlob = await toWebp(imageCanvas, 0.86)
        if (!editBoxes.length) {
          resolve({ imageBlob, maskBlob: null })
          return
        }

        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = width
        maskCanvas.height = height
        const maskContext = maskCanvas.getContext('2d')
        if (!maskContext) {
          resolve({ imageBlob, maskBlob: null })
          return
        }
        maskContext.fillStyle = '#000000'
        maskContext.fillRect(0, 0, width, height)
        maskContext.globalCompositeOperation = 'destination-out'
        for (const box of editBoxes) {
          const padX = Math.max(4, (box.width / 100) * width * 0.12)
          const padY = Math.max(4, (box.height / 100) * height * 0.12)
          const x = Math.max(0, (box.x / 100) * width - padX)
          const y = Math.max(0, (box.y / 100) * height - padY)
          const boxWidth = Math.min(width - x, (box.width / 100) * width + padX * 2)
          const boxHeight = Math.min(height - y, (box.height / 100) * height + padY * 2)
          maskContext.clearRect(x, y, boxWidth, boxHeight)
        }
        resolve({ imageBlob, maskBlob: await toWebp(maskCanvas, 1) })
      } catch (error) {
        reject(error)
      }
    }
    img.onerror = () => reject(new Error('Spyda could not prepare the active design for generation.'))
  })
}

function getImageDimensionsFromSrc(imageSrc: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    if (!imageSrc.startsWith('data:') && !imageSrc.startsWith('blob:')) {
      img.crossOrigin = 'anonymous'
    }
    img.src = imageSrc
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
    img.onerror = () => reject(new Error('Spyda could not read the uploaded reference. Re-upload it and try again.'))
  })
}

function resizeImageToDimensions(imageSrc: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not resize child source.'))
        return
      }

      const targetRatio = width / height
      const imageRatio = img.width / img.height
      let cropX = 0
      let cropY = 0
      let cropWidth = img.width
      let cropHeight = img.height

      if (imageRatio > targetRatio) {
        cropWidth = img.height * targetRatio
        cropX = (img.width - cropWidth) / 2
      } else if (imageRatio < targetRatio) {
        cropHeight = img.width / targetRatio
        cropY = (img.height - cropHeight) / 2
      }

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Spyda received an unreadable generated image. Apply the round again.'))
    img.src = imageSrc
  })
}

function getImageSizeChoice(imageSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.src = imageSrc
    img.onload = () => {
      const ratio = img.width / Math.max(1, img.height)
      if (ratio > 1.12) resolve('Landscape 1536 x 1024')
      else if (ratio < 0.9) resolve('Portrait 1024 x 1536')
      else resolve('Square 1024 x 1024')
    }
    img.onerror = () => reject(new Error('Spyda could not read the uploaded reference size. Re-upload it and try again.'))
  })
}

async function readApiJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''

  if (response.status === 413) {
    throw new Error('The generation package exceeded Vercel\'s upload limit. Remove one replacement image or upload smaller files, then try again.')
  }
  if (response.status === 408 || response.status === 504) {
    throw new Error('The generation request timed out before the image model finished. Your selected changes are still saved; try Apply again.')
  }

  if (contentType.includes('application/json')) {
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || `Server returned ${response.status}.`)
    }
    return payload as T
  }

  const text = await response.text()
  if (/FUNCTION_INVOCATION_TIMEOUT|timed out/i.test(text)) {
    throw new Error('The generation request timed out before the image model finished. Your selected changes are still saved; try Apply again.')
  }
  if (/FUNCTION_PAYLOAD_TOO_LARGE|payload too large/i.test(text)) {
    throw new Error('The generated image or upload package exceeded Vercel\'s size limit. Try again after removing one replacement image.')
  }
  const serverMessage = text.trim().slice(0, 220) || `Server returned ${response.status}.`
  throw new Error(serverMessage)
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

function saveProjectSnapshot(project: SavedSpydaProject) {
  if (typeof window === 'undefined') return
  try {
    const existing = loadSavedProjects()
    const next = [project, ...existing.filter(item => item.id !== project.id)].slice(0, 24)
    window.localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('spyda-projects-updated'))
  } catch (error) {
    console.warn('Spyda could not save this project snapshot locally.', error)
  }
}

export default function Workspace() {
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024)
  const [activeId, setActiveId] = useState('canvas')
  const [aiModel, setAiModel] = useState<AiModel>(AI_MODELS[1])
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [profilePic, setProfilePic] = useState<string | null>(null)
  const [walletRefreshKey, setWalletRefreshKey] = useState(0)
  const { user, signOut } = useAuth()

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

  // Canvas state — lifted so it persists across sidebar nav
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [essentialsImage, setEssentialsImage] = useState<{ name: string; dataUrl: string } | null>(null)
  const [breakdown, setBreakdown] = useState<BreakdownResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [qaParentPreview, setQaParentPreview] = useState<string | null>(null)
  const [generationQa, setGenerationQa] = useState<GenerationQaReport | null>(null)
  const [analysisStage, setAnalysisStage] = useState('')
  const [generationStage, setGenerationStage] = useState('')
  const [essentialPrompts, setEssentialPrompts] = useState(['', '', ''])
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Atom edits — keyed by section id
  const [atomEdits, setAtomEdits] = useState<Record<string, AtomEdit>>({})

  // Brand card state
  const [brandEdits, setBrandEdits] = useState<BrandEdits>({
    headingFont: 'Space Grotesk',
    bodyFont: 'Montserrat',
    primaryColor: '#0F172A',
    secondaryColor: '#22C55E',
    accentColor: '#F8FAFC',
    visualStyle: '',
    essentials: '',
    outputSize: 'match-reference',
    applyBrandConstants: false,
  })

  // Populate brand edits from breakdown
  useEffect(() => {
    if (breakdown?.design?.styleTokens) {
      const c = breakdown.design.styleTokens
      setBrandEdits(prev => ({
        ...prev,
        headingFont: c.typography?.headingFont || c.headingFont || prev.headingFont,
        bodyFont: c.typography?.bodyFont || c.bodyFont || prev.bodyFont,
        primaryColor: normalizeHexColor(c.palette?.primary || c.colors?.primary || '', prev.primaryColor),
        secondaryColor: normalizeHexColor(c.palette?.secondary || c.colors?.secondary || '', prev.secondaryColor),
        accentColor: normalizeHexColor(c.palette?.accent || c.colors?.accent || '', prev.accentColor),
        visualStyle: c.visualStyle || prev.visualStyle,
      }))
    }
  }, [breakdown])

  const pageTitles: Record<string, string> = {
    canvas: 'Canvas',
    'qa-gate': 'QA',
    gallery: 'Gallery',
    history: 'History',
    projects: 'Projects',
    'p-active': 'Active Projects',
    'p-archived': 'Archived Projects',
    templates: 'Templates',
    'brand-assets': 'Brand Assets',
    whitepaper: 'Whitepaper',
    wallet: 'Wallet',
    fund: 'Fund',
    subscription: 'Subscription',
    settings: 'Settings',
  }

  const activeTitle = pageTitles[activeId] || 'Canvas'

  const persistCurrentProject = useCallback((updates: Partial<SavedSpydaProject>) => {
    const id = currentProjectId || updates.id || `spyda-${Date.now()}`
    const existing = loadSavedProjects().find(project => project.id === id)
    saveProjectSnapshot({
      id,
      name: updates.name || existing?.name || uploadedFile?.name || 'Untitled Spyda project',
      createdAt: existing?.createdAt || updates.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: updates.archived ?? existing?.archived ?? false,
      referencePreview: updates.referencePreview ?? existing?.referencePreview ?? uploadedPreview,
      qaParentPreview: updates.qaParentPreview ?? existing?.qaParentPreview ?? qaParentPreview,
      generatedImage: updates.generatedImage ?? existing?.generatedImage ?? generatedImage,
      breakdown: updates.breakdown ?? existing?.breakdown ?? breakdown,
      atomEdits: updates.atomEdits ?? existing?.atomEdits ?? atomEdits,
      brandEdits: updates.brandEdits ?? existing?.brandEdits ?? brandEdits,
      qa: updates.qa ?? existing?.qa ?? generationQa,
    })
  }, [atomEdits, brandEdits, breakdown, currentProjectId, generatedImage, generationQa, qaParentPreview, uploadedFile, uploadedPreview])

  const handleOpenProject = useCallback(async (project: WorkspaceProject) => {
    const source = project.referencePreview || project.generatedImage
    if (!source) return

    try {
      const blob = await dataUrlToBlob(source)
      const safeName = project.name || 'Spyda project'
      const file = new File([blob], safeName, { type: blob.type || 'image/png' })
      setUploadedFile(file)
      setUploadedPreview(project.referencePreview || source)
      setQaParentPreview(project.qaParentPreview || project.referencePreview || source)
      setGeneratedImage(project.generatedImage || null)
      setBreakdown(project.breakdown || null)
      setAtomEdits((project.atomEdits || {}) as Record<string, AtomEdit>)
      if (project.brandEdits) {
        setBrandEdits(previous => ({
          ...previous,
          ...project.brandEdits,
          applyBrandConstants: project.brandEdits?.applyBrandConstants ?? false,
        }))
      }
      setGenerationQa((project.qa || null) as GenerationQaReport | null)
      setCurrentProjectId(project.id)
      setEssentialsImage(null)
      setEssentialPrompts(['', '', ''])
      setAnalyzeError(null)
      setGenerateError(null)
      setActiveId('canvas')
    } catch {
      setActiveId('history')
    }
  }, [])

  const handleUseBrandAsset = useCallback((asset: BrandAsset) => {
    if (asset.kind === 'image') setEssentialsImage({ name: asset.name, dataUrl: asset.value })
    if (asset.kind === 'color') setBrandEdits(previous => ({ ...previous, primaryColor: asset.value }))
    if (asset.kind === 'font') setBrandEdits(previous => ({ ...previous, headingFont: asset.value, bodyFont: asset.value }))
    setActiveId('canvas')
  }, [])

  const handleDesignUpload = useCallback(async (file: File) => {
    const projectId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `spyda-${Date.now()}`
    setUploadedFile(file)
    setUploadedPreview(URL.createObjectURL(file))
    setCurrentProjectId(projectId)
    setBreakdown(null)
    setGeneratedImage(null)
    setQaParentPreview(null)
    setGenerationQa(null)
    setAnalyzeError(null)
    setGenerateError(null)
    setAnalysisStage('Preparing reference image')
    setGenerationStage('')
    setAtomEdits({})
    setEssentialPrompts(['', '', ''])

    // Auto-analyze
    setIsAnalyzing(true)
      try {
        const apiKeys = await loadSpydaApiKeys(user?.id)
        const base64Image = await imageFileToDataUrl(file, 1024, 1024, 0.82);
        const sourceDimensions = await getImageDimensionsFromSrc(base64Image)
        setUploadedPreview(base64Image)
        saveProjectSnapshot({
          id: projectId,
          name: file.name || 'Uploaded reference',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          referencePreview: base64Image,
          generatedImage: null,
          breakdown: null,
          atomEdits: {},
          brandEdits,
          qa: null,
        })
        setAnalysisStage('Reading text, layout, colors, and atoms')
        
        const res = await fetch('/api/analyze', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', ...apiKeyRequestHeaders(apiKeys) },
          body: JSON.stringify({
            base64Image,
            aiProvider: aiModel.provider,
            sourceMetadata: {
              designId: projectId,
              width: sourceDimensions.width,
              height: sourceDimensions.height,
              fileName: file.name,
              mimeType: file.type,
            },
          })
        })
        const data = await readApiJson<ApiAnalyzeResponse>(res)
        setAnalysisStage('Validating editable design atoms')
        
        if (data?.ok && data?.breakdown) {
          setBreakdown(data.breakdown)
          saveProjectSnapshot({
            id: projectId,
            name: file.name || 'Uploaded reference',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            referencePreview: base64Image,
            generatedImage: null,
            breakdown: data.breakdown,
            atomEdits: {},
            brandEdits,
            qa: null,
          })
        } else {
          setAnalyzeError(data?.error || 'Analysis failed. Check your API keys.')
        }
      } catch (err: any) {
        setAnalyzeError(err.message || 'Failed to connect to server.')
      } finally {
        setAnalysisStage('')
        setIsAnalyzing(false)
      }
  }, [aiModel, brandEdits, user?.id])

  const handleUseTemplate = useCallback(async (source: string, name: string) => {
    const response = await fetch(source)
    if (!response.ok) throw new Error('This template could not be loaded.')
    const blob = await response.blob()
    setActiveId('canvas')
    await handleDesignUpload(new File([blob], name, { type: blob.type || 'image/jpeg' }))
  }, [handleDesignUpload])

  /* ── Generate handler ── */
  const handleAtomImageUpload = useCallback(async (section: EditableComponent, file: File) => {
    // PNG keeps logo/asset transparency intact for exact-size compositing
    const uploadedDataUrl = await imageFileToDataUrl(file, 1024, 1024, 0.92, 'image/png')
    const isLogo = /logo|brand mark|wordmark/i.test(`${section.type} ${section.name} ${section.content || ''}`)
    const assetDataUrl = isLogo ? await trimImageWhitespace(uploadedDataUrl) : uploadedDataUrl
    const assetName = file.name
    let measuredBox: AtomBox | undefined
    const activeParent = generatedImage || uploadedPreview
    if (activeParent) {
      const parentSize = await getImageSize(activeParent)
      const detectedBox = parseAtomBox(section.boundingBox, parentSize)
      if (detectedBox) measuredBox = isLogo ? await refineLogoBox(activeParent, detectedBox) : detectedBox
      if (!measuredBox) {
        const assetSize = await getImageSize(assetDataUrl)
        const width = isLogo ? 18 : 28
        const height = Math.min(45, Math.max(4, (width * parentSize.width * assetSize.height) / (parentSize.height * assetSize.width)))
        measuredBox = clampBox({ x: (100 - width) / 2, y: (100 - height) / 2, width, height })
      }
    }
    setAtomEdits(prev => ({
      ...prev,
      [section.id]: {
        ...prev[section.id],
        mode: 'customize',
        value: prev[section.id]?.value || '',
        assetName,
        assetDataUrl,
        box: measuredBox || prev[section.id]?.box,
      },
    }))
  }, [generatedImage, uploadedPreview])

  const handleEssentialsImageUpload = useCallback(async (file: File) => {
    const dataUrl = await imageFileToDataUrl(file, 768, 768, 0.78)
    setEssentialsImage({ name: file.name, dataUrl })
  }, [])

  const handleDeleteAtom = useCallback((sectionId: string) => {
    setAtomEdits(prev => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        mode: 'delete',
        value: 'Remove this element and reconstruct the background beneath it.',
        assetName: undefined,
        assetDataUrl: undefined,
      },
    }))
  }, [])

  const handleGenerate = useCallback(async (options?: { instant?: boolean }) => {
    if (!uploadedFile || !breakdown) return
    const selectedAtoms = (breakdown.design?.editableComponents || [])
      .filter(s => !s.deleted && (atomEdits[s.id]?.mode === 'customize' || atomEdits[s.id]?.mode === 'delete'))
    const filledEssentials = essentialPrompts.map(prompt => prompt.trim()).filter(Boolean)
    const essentialVisualSlots = essentialsImage && filledEssentials.length === 0 ? 1 : 0
    const totalChanges = selectedAtoms.length + filledEssentials.length + essentialVisualSlots

    if (totalChanges < 1) {
      setGenerateError('Pick at least 1 change before applying this round.')
      return
    }
    if (totalChanges > 3) {
      setGenerateError('Keep each round to 3 focused changes — fewer changes at a time is what keeps the output faithful to the parent design.')
      return
    }

    setIsGenerating(true)
    setGenerationQa(null)
    setGenerationStage('Measuring atom placements')
    setGenerateError(null)

    try {
      const apiKeys = options?.instant ? { openai: '', groq: '' } : await loadSpydaApiKeys(user?.id)
      const roundCredits = options?.instant ? 0 : apiKeys.openai ? SPYDA_BYOK_ROUND_CREDITS : SPYDA_AI_ROUND_CREDITS
      const availableCredits = await readSpydaCreditBalance(user?.id)
      if (roundCredits > 0 && availableCredits !== null && availableCredits < roundCredits) {
        setGenerateError(`This round needs ${roundCredits} Spyda credits. Fund your wallet before generating.`)
        return
      }
      const activeSourcePreview = generatedImage || uploadedPreview || ''
      const sourceDimensions = await getImageDimensionsFromSrc(uploadedPreview || '')
      const sourceImageSize = await getImageSizeChoice(uploadedPreview || '')
      const chosenOutputSize = brandEdits.outputSize === 'match-reference' ? sourceImageSize : brandEdits.outputSize
      const previewSize = await getImageSize(activeSourcePreview)
      const layoutGridGuide = buildLayoutGridGuide(
        (breakdown.design?.editableComponents || []).map(section => ({
          id: section.id,
          name: section.name,
          type: section.type,
          boundingBox: section.boundingBox,
          deleted: section.deleted,
          box: atomEdits[section.id]?.box,
        })),
        previewSize,
      )

      // ── Partition the selected changes ──
      // Replacement images with a numeric atom box get placed deterministically
      // on a canvas (pixel math — sizing can never drift). Everything else
      // becomes a short, focused instruction for the AI pass.
      const placedSwaps: Array<{ section: EditableComponent; edit: AtomEdit; box: AtomBox }> = []
      const unplacedAssets: Array<{ section: EditableComponent; edit: AtomEdit }> = []
      const textEdits: Array<{ objectId: string; atomName: string; from: string; to: string }> = []
      const otherEdits: Array<{ objectId: string; atomName: string; instruction: string }> = []
      const removedAtoms: Array<{ objectId: string; atomName: string; type: string; content: string; boundingBox: unknown }> = []

      for (const section of selectedAtoms) {
        const edit = atomEdits[section.id]
        if (!edit) continue
        if (edit.mode === 'delete') {
          removedAtoms.push({
            objectId: section.id,
            atomName: section.name,
            type: section.type,
            content: section.content || section.name,
            boundingBox: edit.box || section.boundingBox,
          })
        } else if (edit.assetDataUrl) {
          const box = edit.box || parseAtomBox(section.boundingBox, previewSize)
          if (box) placedSwaps.push({ section, edit, box: clampBox(box) })
          else unplacedAssets.push({ section, edit })
        } else if (edit.value.trim()) {
          if (section.type === 'text' || section.type === 'action') {
            textEdits.push({ objectId: section.id, atomName: section.name, from: section.content, to: edit.value.trim() })
          } else {
            otherEdits.push({ objectId: section.id, atomName: section.name, instruction: edit.value.trim() })
          }
        }
      }

      const essentialAssetInstruction = filledEssentials.join(' ').toLowerCase()
      const hasAssetModificationVerb = /\b(generate|create|redraw|replace|change|modify|transform|restyle|recolor|remove|invent)\b/.test(essentialAssetInstruction)
      const essentialsAssetOverrideIds = new Set(placedSwaps
        .filter(({ section, edit }) => {
          if (!hasAssetModificationVerb) return false
          const signature = `${section.type} ${section.name} ${section.content || ''} ${edit.assetName || ''}`.toLowerCase()
          const targetWords = signature.match(/[a-z0-9]{4,}/g) || []
          return targetWords.some(word => essentialAssetInstruction.includes(word))
        })
        .map(({ section }) => section.id))

      // ── Explicit Brand Constants mode ──
      // ON applies the complete card globally; OFF keeps the active parent's
      // brand styling untouched.
      const brandOverrides: Record<string, string> = brandEdits.applyBrandConstants ? {
        headingFont: brandEdits.headingFont,
        bodyFont: brandEdits.bodyFont,
        primaryColor: brandEdits.primaryColor,
        secondaryColor: brandEdits.secondaryColor,
        accentColor: brandEdits.accentColor,
        visualStyle: brandEdits.visualStyle.trim(),
      } : {}
      const hasBrandOverrides = brandEdits.applyBrandConstants

      // ── Deterministic placement: bake replacements into the parent ──
      setGenerationStage(placedSwaps.length ? 'Placing replacements at exact size' : 'Preparing design')
      const compositeDataUrl = placedSwaps.length
        ? await compositeReplacements(activeSourcePreview, placedSwaps.map(swap => ({
            box: swap.box,
            src: swap.edit.assetDataUrl!,
            trimWhitespace: /logo|brand mark|wordmark/i.test(`${swap.section.type} ${swap.section.name} ${swap.section.content || ''}`),
            clearUnderlying: true,
          })))
        : activeSourcePreview

      const finalizeRound = async (imageSrc: string, qa: GenerationQaReport | null) => {
        const normalizedImageSrc = await resizeImageToDimensions(imageSrc, sourceDimensions.width, sourceDimensions.height)
        const selectedIds = new Set(selectedAtoms.map(atom => atom.id))
        const nextBreakdown: BreakdownResult = {
          ...breakdown,
          design: {
            ...breakdown.design,
            editableComponents: (breakdown.design?.editableComponents || []).map(atom =>
              selectedIds.has(atom.id) ? { ...atom, deleted: true } : atom
            ),
          },
        }
        const nextAtomEdits = { ...atomEdits }
        for (const atom of selectedAtoms) delete nextAtomEdits[atom.id]
        setQaParentPreview(activeSourcePreview)
        setGeneratedImage(normalizedImageSrc)
        setGenerationQa(qa)
        persistCurrentProject({
          id: currentProjectId || undefined,
          name: uploadedFile.name || 'Spyda generated design',
          referencePreview: uploadedPreview,
          qaParentPreview: activeSourcePreview,
          generatedImage: normalizedImageSrc,
          breakdown: nextBreakdown,
          atomEdits: nextAtomEdits,
          brandEdits,
          qa,
        })
        setBreakdown(nextBreakdown)
        setAtomEdits(nextAtomEdits)
        setEssentialPrompts(['', '', ''])
        return normalizedImageSrc
      }

      const needsAi = Boolean(textEdits.length || otherEdits.length || removedAtoms.length || filledEssentials.length || hasBrandOverrides || unplacedAssets.length || essentialsImage)
      const measuredEditBoxes = selectedAtoms
        .map(section => atomEdits[section.id]?.box || parseAtomBox(section.boundingBox, previewSize))
        .filter((box): box is AtomBox => box !== null)
        .map(clampBox)
      const hasGlobalEdit = Boolean(filledEssentials.length || hasBrandOverrides || unplacedAssets.length || essentialsImage)
      const localizedEditBoxes = !hasGlobalEdit && measuredEditBoxes.length === selectedAtoms.length
        ? measuredEditBoxes
        : []

      // ── Instant paste: pure image swaps need no AI at all ──
      if (options?.instant) {
        if (needsAi) {
          setGenerateError('Instant paste only works when every selected change is a replacement image with a placement box. Text, brand, and Essentials changes need the AI pass.')
          return
        }
        if (!placedSwaps.length) {
          setGenerateError('Nothing to paste — upload a replacement image for a selected atom first.')
          return
        }
        setGenerationStage('Pasting replacements — no AI, no credit')
        await finalizeRound(compositeDataUrl, {
          ok: true,
          skipped: false,
          passed: true,
          score: 100,
          layoutMatch: 'Unchanged — parent pixels untouched',
          sizeMatch: 'Exact — placed deterministically by Spyda without an AI pass',
          outcome: 'The selected replacement was placed exactly without an AI reconstruction pass.',
          creditsSpent: 0,
          solidFindings: ['The parent layout and all untouched pixels were preserved.'],
          unchangedElementsConfirmed: ['Every unselected element remained unchanged.'],
          issues: [],
          suggestions: [],
          detectedIssues: [],
          correctiveEssentials: [],
        })
        return
      }

      // ── AI pass: blend pasted assets + apply text/brand/essential changes ──
      const referenceImages = unplacedAssets.slice(0, 5).map(({ section, edit }) => ({
        sectionId: section.id,
        sectionName: section.name,
        sectionType: section.type,
        name: edit.assetName || `${section.name} replacement`,
        fieldName: `referenceImage-${section.id}`,
        dataUrl: edit.assetDataUrl || '',
        originalBoundingBox: typeof section.boundingBox === 'string' ? section.boundingBox : JSON.stringify(section.boundingBox),
        originalContent: section.content || '',
        originalStyle: section.style || '',
      })).filter(isGenerationReferenceImage)

      const recipe: Record<string, any> = {
        compositeMode: true,
        clientCorrectionLoop: true,
        deferQa: true,
        quality: 'medium',
        creditsSpent: roundCredits,
        billingMode: apiKeys.openai ? 'bring-your-api-key' : 'spyda-managed-api',
        architectureVersion: breakdown.architectureVersion || 'spyda-v1-compatibility',
        designDocument: breakdown.designDocument,
        layoutIntelligence: breakdown.layoutIntelligence,
        constraintProfile: breakdown.constraintProfile,
        layoutGridGuide,
        layoutLock: {
          atoms: layoutGridGuide.atoms.map(atom => ({
            id: atom.id,
            name: atom.name,
            type: atom.type,
            boundingBox: atom.bounds,
            gridCell: atom.gridCell,
          })),
        },
        editableComponents: (breakdown.design?.editableComponents || []).filter(component => !component.deleted),
        aiProvider: aiModel.provider,
        imageSize: chosenOutputSize,
        matchReference: brandEdits.outputSize === 'match-reference',
        sourceImageSize,
        sourceDimensions,
        outputSizeLabel: OUTPUT_SIZE_OPTIONS.find(option => option.value === brandEdits.outputSize)?.label || 'Match uploaded reference',
        childSourceImage: {
          name: placedSwaps.length ? 'Working design with replacements already placed at exact size' : 'Current working design',
          role: 'current-working-design',
          fieldName: 'childSourceImage',
        },
        essentialsImage: essentialsImage ? {
          name: essentialsImage.name,
          fieldName: 'essentialsImage',
          role: 'user-provided essentials reference',
        } : undefined,
        pastedAssets: placedSwaps.map(swap => ({
          objectId: swap.section.id,
          name: swap.edit.assetName || 'Replacement asset',
          atomName: swap.section.name,
          originalContent: swap.section.content || swap.section.name,
          box: swap.box,
          userPlaced: true,
          exactUploadLock: !essentialsAssetOverrideIds.has(swap.section.id),
          allowModelRedraw: essentialsAssetOverrideIds.has(swap.section.id),
          allowModelReplacement: essentialsAssetOverrideIds.has(swap.section.id),
        })),
        textEdits,
        otherEdits,
        removedAtoms,
        brandOverrides: hasBrandOverrides ? brandOverrides : null,
        brandConstantsMode: hasBrandOverrides ? 'apply' : 'preserve-parent',
        essentials: filledEssentials,
        referenceImages: referenceImages.map(image => ({
          sectionId: image.sectionId,
          sectionName: image.sectionName,
          sectionType: image.sectionType,
          name: image.name,
          fieldName: image.fieldName,
          originalBoundingBox: image.originalBoundingBox,
          originalContent: image.originalContent,
          originalStyle: image.originalStyle,
        })),
      }

      const preparedInput = await prepareMaskedGenerationInput(compositeDataUrl, localizedEditBoxes)
      const childSourceBlob = preparedInput.imageBlob
      const editMaskBlob = preparedInput.maskBlob
      if (editMaskBlob) recipe.editMask = { fieldName: 'editMask', role: 'selected-atom edit boundary' }
      let uploadBytes = childSourceBlob.size
      if (editMaskBlob) uploadBytes += editMaskBlob.size
      const essentialsBlob = essentialsImage
        ? await imageSourceToBlob(essentialsImage.dataUrl, 768, 768, 0.78)
        : null
      if (essentialsBlob) uploadBytes += essentialsBlob.size
      const referenceUploads: Array<{ fieldName: string; name: string; blob: Blob }> = []
      for (const image of referenceImages) {
        const blob = await imageSourceToBlob(image.dataUrl, 768, 768, 0.78)
        uploadBytes += blob.size
        referenceUploads.push({ fieldName: image.fieldName, name: image.name || `${image.sectionId}.jpg`, blob })
      }

      if (uploadBytes > SAFE_GENERATION_UPLOAD_BYTES) {
        throw new Error('This generation package is still too large for the server. Remove one replacement image or upload smaller image files, then try again.')
      }

      const buildGenerationForm = (attemptRecipe: Record<string, any>) => {
        const form = new FormData()
        form.append('recipe', JSON.stringify(attemptRecipe))
        form.append('childSourceImage', childSourceBlob, 'working-design.webp')
        if (editMaskBlob) form.append('editMask', editMaskBlob, 'edit-mask.webp')
        if (essentialsBlob && essentialsImage) {
          form.append('essentialsImage', essentialsBlob, essentialsImage.name || 'essentials-reference.jpg')
        }
        for (const upload of referenceUploads) form.append(upload.fieldName, upload.blob, upload.name)
        return form
      }

      setGenerationStage(editMaskBlob
        ? 'Applying one focused GPT-Image 2 edit'
        : 'Applying one GPT-Image 2 edit')
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: apiKeyRequestHeaders(apiKeys),
        body: buildGenerationForm(recipe),
      })
      const data = await readApiJson<ApiGenerateResponse>(response)

      if (data?.ok && data?.image) {
        setGenerationStage(placedSwaps.length ? 'Locking exact uploaded assets' : 'Finalizing design')
        const imageSrc = data.image.startsWith('http') || data.image.startsWith('data:image/')
          ? data.image
          : `data:image/webp;base64,${data.image}`
        const lockedPlacedSwaps = placedSwaps.filter(swap => !essentialsAssetOverrideIds.has(swap.section.id))
        const assetLockedImageSrc = lockedPlacedSwaps.length
          ? await compositeReplacements(imageSrc, lockedPlacedSwaps.map(swap => ({
              box: swap.box,
              src: swap.edit.assetDataUrl!,
              trimWhitespace: /logo|brand mark|wordmark/i.test(`${swap.section.type} ${swap.section.name} ${swap.section.content || ''}`),
              clearUnderlying: true,
            })))
          : imageSrc
        const pendingQa: GenerationQaReport = { ok: true, skipped: true, pending: true, creditsSpent: roundCredits }
        const normalizedImageSrc = await finalizeRound(assetLockedImageSrc, pendingQa)
        await spendSpydaCredits(user?.id, roundCredits)

        void (async () => {
          try {
            const generatedBlob = await imageSourceToBlob(normalizedImageSrc, 768, 1152, 0.72)
            const qaForm = new FormData()
            qaForm.append('recipe', JSON.stringify({ ...recipe, deferQa: false, editMask: undefined }))
            qaForm.append('childSourceImage', childSourceBlob, 'qa-parent.webp')
            qaForm.append('generatedImage', generatedBlob, 'qa-child.webp')
            const qaResponse = await fetch('/api/validate-generation', { method: 'POST', headers: apiKeyRequestHeaders(apiKeys), body: qaForm })
            const qaData = await readApiJson<{ ok: boolean; qa?: GenerationQaReport; error?: string }>(qaResponse)
            const qa = qaData.qa
              ? { ...qaData.qa, creditsSpent: qaData.qa.creditsSpent ?? roundCredits }
              : { ok: false, skipped: true, creditsSpent: roundCredits, error: qaData.error || 'Background QA did not finish.' }
            setGenerationQa(qa)
            persistCurrentProject({
              id: currentProjectId || undefined,
              qaParentPreview: activeSourcePreview,
              generatedImage: normalizedImageSrc,
              qa,
            })
          } catch (qaError: any) {
            const qa = { ok: false, skipped: true, creditsSpent: roundCredits, error: String(qaError?.message || 'Background QA did not finish.') }
            setGenerationQa(qa)
            persistCurrentProject({ id: currentProjectId || undefined, generatedImage: normalizedImageSrc, qa })
          }
        })()
      } else if (data?.ok && !data?.image) {
        setGenerateError(data?.message || 'Generation returned no image (mock mode — set OPENAI_API_KEY).')
      } else {
        setGenerateError(data?.error || 'Generation failed.')
      }
    } catch (err: any) {
      const message = String(err?.message || '')
      setGenerateError(
        message === 'Failed to fetch'
          ? 'Spyda could not connect to the generation server. Check your connection and retry; your selected changes are still saved.'
          : message || 'Spyda could not prepare one of the selected images. Re-upload that replacement or Essential visual, then try again.'
      )
    } finally {
      setGenerationStage('')
      setIsGenerating(false)
    }
  }, [uploadedFile, breakdown, atomEdits, brandEdits, essentialsImage, aiModel, currentProjectId, uploadedPreview, generatedImage, essentialPrompts, persistCurrentProject, user?.id])

  /* ── Reset handler ── */
  const handleReset = useCallback(() => {
    setUploadedFile(null)
    setUploadedPreview(null)
    setCurrentProjectId(null)
    setEssentialsImage(null)
    setBreakdown(null)
    setGeneratedImage(null)
    setQaParentPreview(null)
    setGenerationQa(null)
    setAnalysisStage('')
    setGenerationStage('')
    setEssentialPrompts(['', '', ''])
    setAnalyzeError(null)
    setGenerateError(null)
    setAtomEdits({})
    setBrandEdits({
      headingFont: 'Space Grotesk',
      bodyFont: 'Montserrat',
      primaryColor: '#0F172A',
      secondaryColor: '#22C55E',
      accentColor: '#F8FAFC',
      visualStyle: '',
      essentials: '',
      outputSize: 'match-reference',
      applyBrandConstants: false,
    })
  }, [])

  return (
    <div className="flex h-[100dvh] bg-background text-foreground font-sans overflow-hidden">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:relative h-full shrink-0 transition-all duration-300 ease-in-out overflow-hidden bg-[#060608]/95 backdrop-blur-2xl lg:bg-transparent border-r border-white/[0.04] lg:border-none ${sidebarOpen ? 'w-[260px] translate-x-0' : 'w-[260px] -translate-x-full lg:w-0 lg:translate-x-0'}`}>
        <SidebarNav
          className="w-[260px] h-full"
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id)
            if (window.innerWidth < 1024) setSidebarOpen(false)
          }}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Bar */}
        <div className="relative z-50 h-14 shrink-0 border-b border-white/[0.06] bg-[#060608]/80 backdrop-blur-xl flex items-center justify-between px-4">
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
              {activeId === 'canvas' && (
                <button
                  onClick={() => setActiveId('qa-gate')}
                  title="Open QA"
                  className="relative ml-1 p-1.5 rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors"
                >
                  <ShieldCheck className={`w-[18px] h-[18px] ${generationQa && !generationQa.skipped ? (generationQa.passed === false ? 'text-amber-500' : 'text-primary') : ''}`} strokeWidth={1.5} />
                  {generationQa && !generationQa.skipped && generationQa.passed === false && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* AI Model Switcher */}
            <div className="relative">
              <button
                onClick={() => setModelMenuOpen(!modelMenuOpen)}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-xs font-medium text-muted-foreground hover:bg-white/[0.06] transition-colors"
              >
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span className="hidden sm:inline">{aiModel.label}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {modelMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModelMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-white/[0.08] bg-[#0a0a0c] shadow-2xl py-1.5 animate-fade-in">
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
            {activeId === 'canvas' && uploadedFile && (
              <button onClick={handleReset} title="Reset" aria-label="Reset" className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs font-medium text-muted-foreground hover:bg-white/[0.06] transition-colors sm:px-3">
                <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Reset</span>
              </button>
            )}
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
            <StudioView
              uploadedFile={uploadedFile}
              uploadedPreview={qaParentPreview || uploadedPreview}
              breakdown={breakdown}
              isAnalyzing={isAnalyzing}
              isGenerating={isGenerating}
              generatedImage={generatedImage}
              generationQa={generationQa}
              analysisStage={analysisStage}
              generationStage={generationStage}
              analyzeError={analyzeError}
              generateError={generateError}
              atomEdits={atomEdits}
              brandEdits={brandEdits}
              essentialsImage={essentialsImage}
              essentialPrompts={essentialPrompts}
              onUpload={handleDesignUpload}
              onAtomImageUpload={handleAtomImageUpload}
              onEssentialsImageUpload={handleEssentialsImageUpload}
              onRemoveEssentialsImage={() => setEssentialsImage(null)}
              onDeleteAtom={handleDeleteAtom}
              onGenerate={() => handleGenerate()}
              onInstantPaste={() => handleGenerate({ instant: true })}
              onReset={handleReset}
              onAtomEdit={(id, mode, value) => setAtomEdits(prev => ({ ...prev, [id]: { ...prev[id], mode, value } }))}
              onAtomBoxChange={(id, box) => setAtomEdits(prev => ({ ...prev, [id]: { ...(prev[id] || { mode: 'customize', value: '' }), box } }))}
              onEssentialPromptChange={(index, value) => setEssentialPrompts(prev => prev.map((prompt, promptIndex) => promptIndex === index ? value : prompt))}
              onBrandEdit={(field, value) => setBrandEdits(prev => ({ ...prev, [field]: value }))}
            />
          )}
          {activeId === 'qa-gate' && (
            <QaGateView
              qa={generationQa}
              generatedImage={generatedImage}
              uploadedPreview={qaParentPreview || uploadedPreview}
              onBack={() => setActiveId('canvas')}
              onApplyEssentials={(essentials) => {
                setEssentialPrompts([essentials[0] || '', essentials[1] || '', essentials[2] || ''])
                setActiveId('canvas')
              }}
            />
          )}
          {activeId === 'gallery' && <GalleryView onNewDesign={() => setActiveId('canvas')} />}
          {activeId === 'history' && <HistoryView onOpenProject={handleOpenProject} onNewDesign={() => setActiveId('canvas')} />}
          {['projects', 'p-active', 'p-archived'].includes(activeId) && <ProjectsView initialFilter={activeId === 'p-archived' ? 'archived' : 'active'} onOpenProject={handleOpenProject} onNewDesign={() => setActiveId('canvas')} />}
          {activeId === 'templates' && <TemplatesView onUseTemplate={handleUseTemplate} />}
          {activeId === 'brand-assets' && <BrandAssetsView onUseAsset={handleUseBrandAsset} />}
          {activeId === 'whitepaper' && <WhitepaperView />}
          {activeId === 'wallet' && <WalletView key={walletRefreshKey} onFund={() => setActiveId('fund')} />}
          {activeId === 'fund' && <FundView onBack={() => { setWalletRefreshKey(k => k + 1); setActiveId('wallet') }} />}
          {activeId === 'subscription' && <SubscriptionView onBack={() => setActiveId('settings')} onOpenWallet={() => setActiveId('wallet')} onOpenSettings={() => setActiveId('settings')} />}
          {activeId === 'settings' && <SettingsView profilePic={profilePic} setProfilePic={setProfilePic} onManageSubscription={() => setActiveId('subscription')} />}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   QA View
   ═══════════════════════════════════════════════ */

function deriveQaEssentials(qa: GenerationQaReport | null): string[] {
  if (!qa || qa.skipped) return []

  const essentials: string[] = []
  const push = (value: string | undefined) => {
    const cleaned = (value || '').trim()
    if (!cleaned) return
    if (essentials.some(existing => existing.toLowerCase() === cleaned.toLowerCase())) return
    if (essentials.length < 3) essentials.push(cleaned)
  }

  const detectedIssues = qa.detectedIssues || qa.issues || []
  for (const suggestion of qa.correctiveEssentials || qa.suggestions || []) push(suggestion)
  for (const issue of detectedIssues) push(`Fix this from the last generation: ${issue}`)

  if (!essentials.length && !detectedIssues.length && qa.passed !== false) return []

  const fillers = [
    qa.sizeMatch && 'Render every replacement logo, image, and text at the exact visible size, position, and footprint of the original atom it replaces — scale oversized uploads down, never up.',
    qa.layoutMatch && 'Keep the layout identical to the parent design: same regions, margins, and hierarchy; nothing cropped at the top or bottom edge.',
    qa.assetMatch && 'Do not recolor, redraw, or decorate any uploaded logo, photo, QR code, or badge; preserve each asset exactly as provided.',
    'Match the parent design exactly except for the requested changes.',
  ].filter(Boolean) as string[]
  for (const filler of fillers) push(filler)

  return essentials
}

function QaGateView({ qa, generatedImage, uploadedPreview, onBack, onApplyEssentials }: {
  qa: GenerationQaReport | null
  generatedImage: string | null
  uploadedPreview: string | null
  onBack: () => void
  onApplyEssentials: (essentials: string[]) => void
}) {
  const detectedIssues = Array.from(new Set([
    ...(qa?.detectedIssues || qa?.issues || []),
    ...(qa?.unapprovedChanges || []).map(change => `Unapproved change: ${change}`),
    ...(qa?.hardGateFailures || []).map(failure => `${failure.message}${failure.region ? ` (${failure.region})` : ''}`),
  ].filter(Boolean)))
  const suggestedEssentials = deriveQaEssentials(qa)
  const hasReport = Boolean(qa && !qa.skipped)
  const failed = hasReport && qa?.passed === false
  const score = typeof qa?.score === 'number' ? qa.score : null
  const creditsSpent = typeof qa?.creditsSpent === 'number' ? Math.max(0, qa.creditsSpent) : null
  const solidFindings = Array.from(new Set([
    ...(qa?.solidFindings || []),
    ...(qa?.unchangedElementsConfirmed || []).map(item => `Preserved: ${item}`),
  ].filter(Boolean)))
  const outcome = qa?.outcome || (failed
    ? 'The round needs correction because at least one requested edit was missed or an unapproved change was introduced.'
    : 'The requested changes were delivered while the unselected parts of the parent design remained protected.')

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-8 animate-fade-in">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Canvas
      </button>

      {qa?.pending ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-primary/15 bg-primary/[0.025] px-6 py-20 text-center">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold">Design ready, checking fidelity</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
             Your flyer is already available on the Canvas. Spyda is checking whether the approved changes were delivered and whether untouched regions remained stable.
          </p>
        </div>
      ) : !hasReport ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] py-20 text-center px-6">
          <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mb-4" strokeWidth={1.25} />
          <h2 className="text-lg font-semibold">No QA report yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
             Generate a design on the Canvas and Spyda will check the requested outcome, unchanged regions, layout safety, assets, brand compliance, and edges.
          </p>
          {qa?.error && <p className="mt-3 text-xs text-amber-500">Last QA attempt failed: {qa.error}</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Outcome summary */}
          <section className={`overflow-hidden rounded-2xl border ${failed ? 'border-amber-500/35 bg-amber-500/[0.045]' : 'border-primary/20 bg-primary/[0.035]'}`}>
            <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className={`h-5 w-5 ${failed ? 'text-amber-500' : 'text-primary'}`} strokeWidth={1.75} />
                <div>
                  <p className={`text-sm font-bold ${failed ? 'text-amber-500' : 'text-primary'}`}>{failed ? 'Correction needed' : 'Outcome approved'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">QA judges requested edits and parent fidelity together.</p>
                </div>
              </div>
              {qa?.retried && <span className="text-xs font-semibold text-muted-foreground">Auto-retried</span>}
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
              <div className="px-3 py-4 sm:px-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Intent &amp; Fidelity</p>
                <p className={`mt-1 font-heading text-2xl font-semibold ${failed ? 'text-amber-500' : 'text-primary'}`}>{score ?? '--'}{score !== null && <span className="text-xs text-muted-foreground">/100</span>}</p>
              </div>
              <div className="px-3 py-4 sm:px-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Issues found</p>
                <p className={`mt-1 font-heading text-2xl font-semibold ${detectedIssues.length ? 'text-amber-500' : 'text-primary'}`}>{detectedIssues.length}</p>
              </div>
              <div className="px-3 py-4 sm:px-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Credits spent</p>
                <p className="mt-1 font-heading text-2xl font-semibold">{creditsSpent ?? '--'}{creditsSpent !== null && <span className="ml-1 text-xs text-muted-foreground">credits</span>}</p>
              </div>
            </div>
          </section>

          {/* Side-by-side comparison */}
          {(uploadedPreview || generatedImage) && (
            <div className="grid grid-cols-2 gap-4">
              {uploadedPreview && (
                <div>
                  <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-muted-foreground mb-2">Parent Source</p>
                  <img src={uploadedPreview} alt="Parent source" className="w-full rounded-xl border border-white/[0.06]" />
                </div>
              )}
              {generatedImage && (
                <div>
                  <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-muted-foreground mb-2">Generated Design</p>
                  <img src={generatedImage} alt="Generated design" className="w-full rounded-xl border border-white/[0.06]" />
                </div>
              )}
            </div>
          )}

          {!!qa?.categoryScores && Object.keys(qa.categoryScores).length > 0 && (
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Intent &amp; Fidelity</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {Object.entries(qa.categoryScores).map(([category, score]) => (
                  <div key={category} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                    <p className="truncate text-[10px] font-semibold capitalize text-muted-foreground">{category.replace(/([A-Z])/g, ' $1')}</p>
                    <p className={`mt-1 text-lg font-bold ${score >= 95 ? 'text-primary' : score >= 85 ? 'text-foreground' : 'text-amber-500'}`}>{score}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category notes */}
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Layout', value: qa?.layoutMatch },
              { label: 'Text', value: qa?.textMatch },
              { label: 'Assets', value: qa?.assetMatch },
              { label: 'Replacement Size', value: qa?.sizeMatch },
            ].filter(item => item.value).map(item => (
              <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm text-foreground/85">{item.value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-primary/20 bg-primary/[0.03] px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Outcomes</p>
            <p className="mt-2 text-sm leading-6 text-foreground/90">{outcome}</p>
            {!!qa?.approvedChangesApplied?.length && (
              <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
                {qa.approvedChangesApplied.map((change, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-foreground/85">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {change}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">What was solid</p>
            {solidFindings.length ? (
              <ul className="mt-2 space-y-1.5">
                {solidFindings.map((finding, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-foreground/85">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {finding}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No positive evidence was returned for this older report. Run another round to receive the expanded QA analysis.</p>
            )}
          </section>

          {!!qa?.hardGateFailures?.length && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-500">Hard Gate Failures</p>
              <ul className="space-y-1.5">
                {qa.hardGateFailures.map((failure, index) => (
                  <li key={`${failure.code}-${index}`} className="text-sm text-foreground/85">
                    <span className="font-semibold">{failure.message}</span>{failure.region ? ` — ${failure.region}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Issues */}
          <section className={`rounded-xl border px-4 py-4 ${detectedIssues.length ? 'border-amber-500/25 bg-amber-500/[0.035]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Detected Issues</p>
            {detectedIssues.length ? (
              <ul className="mt-2 space-y-1.5">
                {detectedIssues.map((issue, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-foreground/85">
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {issue}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 flex items-start gap-2 text-sm text-foreground/80"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> No genuine issues detected. Unselected elements were correctly treated as intentional, unchanged content.</p>
            )}
          </section>

          {/* Suggested corrective essentials */}
          {suggestedEssentials.length ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] px-5 py-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary">Suggested Corrective Essentials</p>
                  <p className="mt-1 text-xs text-muted-foreground">Spyda turned the QA findings into 3 Essentials. Apply them and regenerate so the AI model corrects these exact problems.</p>
                </div>
              </div>
              <ol className="space-y-2">
                {suggestedEssentials.map((essential, index) => (
                  <li key={index} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-foreground/85">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{index + 1}</span>
                    {essential}
                  </li>
                ))}
              </ol>
              <button
                onClick={() => onApplyEssentials(suggestedEssentials)}
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Wand2 className="w-4 h-4" /> Apply as Essentials &amp; return to Canvas
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground">This fills the 3 Essential prompt slots on the Canvas (replacing anything typed there) and counts as your 3 changes for the next round.</p>
            </div>
          ) : (
            <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Suggested Corrective Essentials</p>
              <p className="mt-2 text-sm text-muted-foreground">No corrective Essential is needed for this round.</p>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Placement Canvas — deterministic replacement placement
   Shows a normalized layout grid over the parent design and
   live-previews replacement assets at their exact final footprint.
   The measured size stays locked; drag only moves it.
   ═══════════════════════════════════════════════ */

function LayoutGridOverlay({ guide }: { guide: LayoutGridGuide }) {
  const safeWidth = Math.max(0, 100 - guide.safeArea.left - guide.safeArea.right)
  const safeHeight = Math.max(0, 100 - guide.safeArea.top - guide.safeArea.bottom)

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
      {Array.from({ length: Math.max(0, guide.columns - 1) }, (_, index) => {
        const line = index + 1
        const major = line % 4 === 0
        return (
          <span
            key={`grid-column-${line}`}
            className={`absolute inset-y-0 w-px ${major ? 'bg-primary/45' : 'bg-white/20'}`}
            style={{ left: `${line / guide.columns * 100}%` }}
          />
        )
      })}
      {Array.from({ length: Math.max(0, guide.rows - 1) }, (_, index) => {
        const line = index + 1
        const major = line % 4 === 0
        return (
          <span
            key={`grid-row-${line}`}
            className={`absolute inset-x-0 h-px ${major ? 'bg-primary/45' : 'bg-white/20'}`}
            style={{ top: `${line / guide.rows * 100}%` }}
          />
        )
      })}
      <span
        className="absolute border border-dashed border-primary/55 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.28)]"
        style={{
          left: `${guide.safeArea.left}%`,
          top: `${guide.safeArea.top}%`,
          width: `${safeWidth}%`,
          height: `${safeHeight}%`,
        }}
      />
      <span className="absolute bottom-2 left-2 rounded-md border border-white/10 bg-black/70 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/75 backdrop-blur-sm">
        {guide.columns} x {guide.rows} layout grid
      </span>
    </div>
  )
}

function PlacementCanvas({
  src, atoms, atomEdits, isAnalyzing, analysisStage, gridGuide, showGridSystem,
  onBoxChange, onToggleGridSystem, onNaturalSizeChange,
}: {
  src: string
  atoms: EditableComponent[]
  atomEdits: Record<string, AtomEdit>
  isAnalyzing: boolean
  analysisStage: string
  gridGuide: LayoutGridGuide
  showGridSystem: boolean
  onBoxChange: (id: string, box: AtomBox) => void
  onToggleGridSystem: () => void
  onNaturalSizeChange: (size: { width: number; height: number }) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const interactionRef = useRef<{
    id: string
    mode: 'move' | 'resize'
    corner?: ResizeCorner
    startX: number
    startY: number
    box: AtomBox
    rectW: number
    rectH: number
  } | null>(null)

  const mappedAtoms = useMemo(() => (
    atoms
      .filter(atom => !atom.deleted)
      .map(atom => ({ atom, box: atomEdits[atom.id]?.box || parseAtomBox(atom.boundingBox, naturalSize) }))
      .filter((entry): entry is { atom: EditableComponent; box: AtomBox } => entry.box !== null)
  ), [atoms, atomEdits, naturalSize])

  const placedReplacements = mappedAtoms.filter(({ atom }) => {
    const edit = atomEdits[atom.id]
    return edit?.mode === 'customize' && edit.assetDataUrl
  })

  const startDrag = (event: React.PointerEvent, id: string, box: AtomBox) => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    event.stopPropagation()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    interactionRef.current = { id, mode: 'move', startX: event.clientX, startY: event.clientY, box, rectW: rect.width, rectH: rect.height }
  }

  const startResize = (event: React.PointerEvent, id: string, box: AtomBox, corner: ResizeCorner) => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    interactionRef.current = { id, mode: 'resize', corner, startX: event.clientX, startY: event.clientY, box, rectW: rect.width, rectH: rect.height }
  }

  const moveInteraction = (event: React.PointerEvent) => {
    const interaction = interactionRef.current
    if (!interaction) return
    event.preventDefault()
    const dx = ((event.clientX - interaction.startX) / interaction.rectW) * 100
    const dy = ((event.clientY - interaction.startY) / interaction.rectH) * 100
    const nextBox = interaction.mode === 'resize' && interaction.corner
      ? resizeBoxFromCorner(interaction.box, interaction.corner, dx, dy)
      : clampBox({ ...interaction.box, x: interaction.box.x + dx, y: interaction.box.y + dy })
    onBoxChange(interaction.id, nextBox)
  }

  const endInteraction = () => { interactionRef.current = null }

  return (
    <div
      className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
      style={{ height: DESIGN_PREVIEW_HEIGHT }}
    >
      <div
        ref={wrapperRef}
        className="relative flex max-w-full items-center justify-center"
        style={{ maxHeight: `calc(${DESIGN_PREVIEW_HEIGHT} - 24px)` }}
      >
        <img
          src={src}
          alt="Active parent source flyer"
          className="block max-w-full object-contain"
          style={{ maxHeight: `calc(${DESIGN_PREVIEW_HEIGHT} - 24px)` }}
          onLoad={event => {
            const size = {
              width: event.currentTarget.naturalWidth || event.currentTarget.width,
              height: event.currentTarget.naturalHeight || event.currentTarget.height,
            }
            setNaturalSize(size)
            onNaturalSizeChange(size)
          }}
        />

        {showGridSystem && <LayoutGridOverlay guide={gridGuide} />}

        {/* Live replacement placement — draggable + resizable */}
        {placedReplacements.map(({ atom, box }) => (
          <div
            key={`placed-${atom.id}`}
            className="absolute z-20 cursor-move rounded-[3px] border-2 border-primary/80 bg-black/10 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%`, touchAction: 'none' }}
            onPointerDown={event => startDrag(event, atom.id, box)}
            onPointerMove={moveInteraction}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
          >
            <img
              src={atomEdits[atom.id]?.assetDataUrl}
              alt={`${atom.name} replacement preview`}
              className="pointer-events-none h-full w-full object-contain"
              draggable={false}
            />
            <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
              {atom.name} — user-set footprint
            </span>
            {([
              { corner: 'nw', position: '-left-1.5 -top-1.5 cursor-nwse-resize', label: 'top left' },
              { corner: 'ne', position: '-right-1.5 -top-1.5 cursor-nesw-resize', label: 'top right' },
              { corner: 'sw', position: '-bottom-1.5 -left-1.5 cursor-nesw-resize', label: 'bottom left' },
              { corner: 'se', position: '-bottom-1.5 -right-1.5 cursor-nwse-resize', label: 'bottom right' },
            ] as const).map(handle => (
              <button
                key={handle.corner}
                type="button"
                aria-label={`Resize ${atom.name} from ${handle.label}`}
                className={`absolute z-30 h-3 w-3 rounded-[2px] border border-black/70 bg-white shadow-[0_0_0_1px_rgba(157,250,176,0.85)] ${handle.position}`}
                style={{ touchAction: 'none' }}
                onPointerDown={event => startResize(event, atom.id, box, handle.corner)}
              />
            ))}
          </div>
        ))}
      </div>

      {!isAnalyzing && gridGuide.atoms.length > 0 && (
        <button
          type="button"
          onClick={onToggleGridSystem}
          className={`absolute right-3 top-3 z-30 inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm transition-colors ${showGridSystem ? 'border-primary/45 bg-primary/15 text-primary' : 'border-white/[0.1] bg-black/65 text-muted-foreground hover:text-foreground'}`}
        >
          <Grid2X2 className="h-3.5 w-3.5" />
          {showGridSystem ? 'Hide Grid System' : 'Show Grid System'}
        </button>
      )}

      {isAnalyzing && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
          <span className="text-sm font-medium text-primary">Spyda is dissecting...</span>
          <span className="text-xs text-muted-foreground mt-1">{analysisStage || 'Analyzing layout, text, colors, structure'}</span>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Studio View — measure-don't-ask editing workflow
   ═══════════════════════════════════════════════ */

function StudioView({
  uploadedFile, uploadedPreview,
  breakdown, isAnalyzing, isGenerating, generatedImage,
  generationQa: _generationQa, analysisStage, generationStage,
  analyzeError, generateError, atomEdits, brandEdits,
  essentialsImage,
  essentialPrompts,
  onUpload, onAtomImageUpload, onEssentialsImageUpload, onRemoveEssentialsImage, onDeleteAtom, onGenerate, onInstantPaste, onReset,
  onAtomEdit, onAtomBoxChange, onBrandEdit, onEssentialPromptChange
}: {
  uploadedFile: File | null
  uploadedPreview: string | null
  breakdown: BreakdownResult | null
  isAnalyzing: boolean
  isGenerating: boolean
  generatedImage: string | null
  generationQa: GenerationQaReport | null
  analysisStage: string
  generationStage: string
  analyzeError: string | null
  generateError: string | null
  atomEdits: Record<string, AtomEdit>
  essentialsImage: { name: string; dataUrl: string } | null
  essentialPrompts: string[]
  brandEdits: BrandEdits
  onUpload: (file: File) => void
  onAtomImageUpload: (section: EditableComponent, file: File) => void
  onEssentialsImageUpload: (file: File) => void
  onRemoveEssentialsImage: () => void
  onDeleteAtom: (sectionId: string) => void
  onGenerate: () => void
  onInstantPaste: () => void
  onReset: () => void
  onAtomEdit: (id: string, mode: 'same' | 'customize', value: string) => void
  onAtomBoxChange: (id: string, box: AtomBox) => void
  onBrandEdit: (field: string, value: string | boolean) => void
  onEssentialPromptChange: (index: number, value: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const essentialsInputRef = useRef<HTMLInputElement>(null)
  const essentialPromptRefs = useRef<Array<HTMLInputElement | null>>([])
  const [isDragging, setIsDragging] = useState(false)
  const [atomsDrawerOpen, setAtomsDrawerOpen] = useState(false)
  const [desktopAtomsPanel, setDesktopAtomsPanel] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024)
  const [showGridSystem, setShowGridSystem] = useState(false)
  const [sourceCanvasSize, setSourceCanvasSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const syncPanelMode = () => setDesktopAtomsPanel(desktopQuery.matches)
    syncPanelMode()
    desktopQuery.addEventListener('change', syncPanelMode)
    return () => desktopQuery.removeEventListener('change', syncPanelMode)
  }, [])

  useEffect(() => {
    if (!atomsDrawerOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAtomsDrawerOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [atomsDrawerOpen])

  useEffect(() => {
    if (!uploadedFile || !breakdown) setAtomsDrawerOpen(false)
  }, [breakdown, uploadedFile])

  useEffect(() => {
    setSourceCanvasSize(null)
    setShowGridSystem(false)
  }, [uploadedPreview])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) onUpload(file)
  }, [onUpload])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
  }, [onUpload])

  // ── Phase 1: Upload zone ──
  if (!uploadedFile) {
    return (
      <div
        className={`flex-1 flex flex-col items-center justify-center p-8 relative transition-colors ${isDragging ? 'bg-primary/[0.04]' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/[0.04] blur-[120px] pointer-events-none" />
        <div className="relative z-10 text-center max-w-lg">
          <div className={`mx-auto mb-8 w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center transition-transform ${isDragging ? 'scale-110' : ''}`}>
            <Upload className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <h2 className="font-heading text-3xl font-bold mb-3">Drop your reference</h2>
          <p className="text-muted-foreground mb-8">Upload a flyer, poster, or ad to begin. Spyda will break it down into editable design atoms.</p>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="group inline-flex h-12 items-center gap-3 rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-8 text-sm font-bold text-primary-foreground shadow-[0_12px_32px_rgba(157,250,176,0.2)] transition-all hover:shadow-[0_16px_40px_rgba(157,250,176,0.3)] hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" /> Upload Reference
          </button>
          <p className="mt-4 text-xs text-muted-foreground/50">PNG, JPG, WEBP — up to 20MB • Or drag and drop</p>
        </div>
      </div>
    )
  }

  // ── Phase 2+: Analyzing / Editing / Generating ──
  const activeSections = breakdown?.design?.editableComponents?.filter(s => !s.deleted) || []
  const visibleSections = activeSections.filter(section => atomEdits[section.id]?.mode !== 'delete')
  const layoutGridGuide = buildLayoutGridGuide(
    activeSections.map(section => ({
      id: section.id,
      name: section.name,
      type: section.type,
      boundingBox: section.boundingBox,
      box: atomEdits[section.id]?.box,
    })),
    sourceCanvasSize,
  )
  const selectedSections = activeSections.filter(section => atomEdits[section.id]?.mode === 'customize' || atomEdits[section.id]?.mode === 'delete')
  const selectedAtomCount = selectedSections.length
  const essentialCount = essentialPrompts.filter(prompt => prompt.trim()).length
  const essentialVisualSlots = essentialsImage && essentialCount === 0 ? 1 : 0
  const totalChangeCount = selectedAtomCount + essentialCount + essentialVisualSlots
  const remainingChangeCount = Math.max(0, 3 - totalChangeCount)
  const canApplyRound = totalChangeCount >= 1 && totalChangeCount <= 3
  const activeSourcePreview = generatedImage || uploadedPreview
  const activeSourceName = generatedImage ? 'Latest generated parent' : uploadedFile.name
  const placedSwapCount = selectedSections.filter(section => atomEdits[section.id]?.mode === 'customize' && atomEdits[section.id]?.assetDataUrl).length
  // Instant paste: every selected change is an image swap and nothing needs the AI pass
  const instantPasteAvailable = placedSwapCount > 0
    && placedSwapCount === selectedAtomCount
    && selectedSections.every(section => !atomEdits[section.id]?.value?.trim())
    && essentialCount === 0
    && !essentialsImage

  return (
    <div className="flex min-h-0 h-full w-full flex-1 flex-col lg:flex-row lg:items-stretch">
      {/* Left: Source + Child Source */}
      <div className="min-h-0 w-full flex-1 shrink-0 overflow-y-auto overscroll-y-auto border-r border-white/[0.06] flex flex-col [-webkit-overflow-scrolling:touch] lg:w-[45%] lg:flex-none">
        {/* Active Source Image */}
        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary">Source</span>
              <span className="text-[11px] text-muted-foreground/50">{activeSourceName}</span>
            </div>
            <button onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Change</button>
          </div>
          <PlacementCanvas
            src={activeSourcePreview!}
            atoms={breakdown?.design?.editableComponents || []}
            atomEdits={atomEdits}
            isAnalyzing={isAnalyzing}
            analysisStage={analysisStage}
            gridGuide={layoutGridGuide}
            showGridSystem={showGridSystem}
            onBoxChange={onAtomBoxChange}
            onToggleGridSystem={() => setShowGridSystem(previous => !previous)}
            onNaturalSizeChange={setSourceCanvasSize}
          />
          {placedSwapCount > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">
              Spyda trims empty logo padding and places the exact upload in the detected slot. Drag to reposition it, then use any corner handle to scale it proportionally.
            </p>
          )}
          {analyzeError && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {analyzeError}
            </div>
          )}
        </div>

        {/* Child Source */}
        <div className="flex flex-1 flex-col px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:pb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary">Child Source</span>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                {totalChangeCount}/3 changes ready
              </span>
              {generatedImage && (
                <a
                  href={generatedImage}
                  download={`spyda-output-${Date.now()}.png`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              )}
            </div>
          </div>
          {generatedImage || uploadedPreview ? (
            <div
              className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-primary/20 bg-white/[0.02] p-3"
              style={{ height: DESIGN_PREVIEW_HEIGHT }}
            >
              <div
                className="relative flex max-w-full items-center justify-center"
                style={{ maxHeight: `calc(${DESIGN_PREVIEW_HEIGHT} - 24px)` }}
              >
                <img
                  src={generatedImage || uploadedPreview || ''}
                  alt="Child source design"
                  className="block max-w-full object-contain"
                  style={{ maxHeight: `calc(${DESIGN_PREVIEW_HEIGHT} - 24px)` }}
                />
                {showGridSystem && <LayoutGridOverlay guide={layoutGridGuide} />}
              </div>
              {isGenerating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                  <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                  <span className="text-sm font-medium text-primary">Updating child source...</span>
                  <span className="text-xs text-muted-foreground mt-1">{generationStage || 'Applying 3 focused changes'}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] flex-1 flex flex-col items-center justify-center min-h-[200px]">
              {isGenerating ? (
                <>
                  <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                  <span className="text-sm font-medium text-primary">Generating design...</span>
                  <span className="text-xs text-muted-foreground mt-1">{generationStage || 'This may take 15-30 seconds'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-8 h-8 text-muted-foreground/20 mb-3" />
                  <span className="text-sm text-muted-foreground">Generated design will appear here</span>
                </>
              )}
            </div>
          )}
          {generateError && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {generateError}
            </div>
          )}
        </div>
      </div>

      {atomsDrawerOpen && (
        <button
          type="button"
          aria-label="Close Design Atoms"
          onClick={() => setAtomsDrawerOpen(false)}
          className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm lg:hidden"
        />
      )}

      {breakdown && !isAnalyzing && (
        <button
          type="button"
          aria-label="Open Design Atoms"
          aria-controls="design-atoms-panel"
          aria-expanded={atomsDrawerOpen}
          onClick={() => setAtomsDrawerOpen(true)}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-[65] inline-flex h-14 w-14 items-center justify-center rounded-full border border-primary/35 bg-[#0b0e0c] shadow-[0_14px_40px_rgba(0,0,0,0.5),0_0_24px_rgba(34,197,94,0.2)] transition-transform active:scale-95 lg:hidden"
        >
          <img src="/assets/spyda-logo-drive.webp" alt="" className="h-9 w-9 object-contain" />
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#0b0e0c] bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {visibleSections.length}
          </span>
        </button>
      )}

      {/* Right: Atom Cards + Brand Card + Generate */}
      <aside
        id="design-atoms-panel"
        aria-label="Design Atoms"
        aria-hidden={!desktopAtomsPanel && !atomsDrawerOpen}
        inert={!desktopAtomsPanel && !atomsDrawerOpen}
        className={`fixed inset-y-0 right-0 z-[80] flex w-[min(92vw,430px)] flex-col overflow-hidden border-l border-white/[0.08] bg-[#080a09] shadow-[-24px_0_64px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out lg:relative lg:inset-auto lg:z-auto lg:w-auto lg:flex-1 lg:translate-x-0 lg:bg-transparent lg:shadow-none ${atomsDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {isAnalyzing ? (
          <div className="flex-1 flex items-center justify-center overflow-y-auto p-6">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
              <h3 className="font-heading text-xl font-semibold mb-2">Dissecting design atoms...</h3>
              <p className="text-sm text-muted-foreground">{analysisStage || 'Spyda is mapping every component of your reference'}</p>
            </div>
          </div>
        ) : breakdown ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Header */}
            <div className="relative z-30 flex w-full shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#080a09] px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] shadow-[0_10px_28px_rgba(0,0,0,0.28)] sm:px-5 lg:bg-background lg:px-6 lg:py-4">
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-semibold">Design Atoms</h3>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {visibleSections.length} component{visibleSections.length !== 1 ? 's' : ''} detected • Edit replacements below
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 sm:px-4"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {isGenerating ? 'Applying' : totalChangeCount === 0 ? 'Select change' : totalChangeCount > 3 ? 'Reduce changes' : `Apply ${totalChangeCount}/3`}
                </button>
                <button
                  type="button"
                  aria-label="Close Design Atoms"
                  onClick={() => setAtomsDrawerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground lg:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pb-5 lg:px-6 lg:pb-6">
            {generateError && (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">
                {generateError}
              </div>
            )}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Edit round — up to 3 focused changes</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedAtomCount} atom change{selectedAtomCount !== 1 ? 's' : ''} + {essentialCount} Essential prompt{essentialCount !== 1 ? 's' : ''}{essentialVisualSlots ? ' + 1 Essential visual' : ''}. {remainingChangeCount} slot{remainingChangeCount !== 1 ? 's' : ''} left.
                    {placedSwapCount > 0 ? ` ${placedSwapCount} replacement image${placedSwapCount !== 1 ? 's' : ''} placed at exact size.` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${canApplyRound ? 'bg-primary/15 text-primary' : 'bg-white/[0.05] text-muted-foreground'}`}>
                  {totalChangeCount}/3
                </span>
              </div>
            </div>

            {/* Atom Cards */}
            {visibleSections.map((section, i) => (
              <AtomCard
                key={section.id}
                section={section}
                index={i}
                edit={atomEdits[section.id]}
                onEdit={onAtomEdit}
                onImageUpload={onAtomImageUpload}
                selectionLocked={atomEdits[section.id]?.mode !== 'customize' && totalChangeCount >= 3}
                onDelete={onDeleteAtom}
              />
            ))}

            {/* Brand Card */}
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary">Brand Constants</span>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/55">
                    {brandEdits.applyBrandConstants ? 'Applied to every reconstruction' : 'Parent brand preserved'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={brandEdits.applyBrandConstants}
                  aria-label="Apply Brand Constants to reconstructions"
                  onClick={() => onBrandEdit('applyBrandConstants', !brandEdits.applyBrandConstants)}
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${brandEdits.applyBrandConstants ? 'border-primary/70 bg-primary' : 'border-white/15 bg-white/[0.06]'}`}
                >
                  <span className={`absolute left-0 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${brandEdits.applyBrandConstants ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <p className="-mt-2 mb-4 text-[11px] leading-relaxed text-muted-foreground/70">
                {brandEdits.applyBrandConstants
                  ? 'Spyda will apply these fonts, colors, and visual style while protecting uploaded logos and images.'
                  : "Spyda will keep the active parent's fonts, colors, and visual style for this reconstruction."}
              </p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Heading Font</label>
                  <input
                    type="text"
                    value={brandEdits.headingFont}
                    onChange={e => onBrandEdit('headingFont', e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-foreground outline-none focus:border-primary/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Body Font</label>
                  <input
                    type="text"
                    value={brandEdits.bodyFont}
                    onChange={e => onBrandEdit('bodyFont', e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-foreground outline-none focus:border-primary/40 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  { label: '60%', name: 'Primary', field: 'primaryColor' as const },
                  { label: '30%', name: 'Secondary', field: 'secondaryColor' as const },
                  { label: '10%', name: 'Accent', field: 'accentColor' as const },
                ].map(c => (
                  <div key={c.field} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                    <label className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-muted-foreground">{c.name}</span>
                      <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-primary">{c.label}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`${c.name} brand color picker`}
                        value={normalizeHexColor(brandEdits[c.field], '#000000')}
                        onChange={e => onBrandEdit(c.field, e.target.value.toUpperCase())}
                        className="h-9 w-9 shrink-0 rounded-full border border-white/[0.1] cursor-pointer bg-transparent p-0"
                      />
                      <input
                        type="text"
                        inputMode="text"
                        value={brandEdits[c.field]}
                        onChange={e => onBrandEdit(c.field, formatHexDraft(e.target.value))}
                        onBlur={e => onBrandEdit(c.field, normalizeHexColor(e.target.value, brandEdits[c.field] || '#000000'))}
                        placeholder="#9DFAB0"
                        maxLength={7}
                        aria-label={`${c.name} HEX color code`}
                        className="min-w-0 flex-1 h-9 rounded-lg border border-white/[0.06] bg-black/20 px-2 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/35 focus:border-primary/40"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Visual Style</label>
                <textarea
                  value={brandEdits.visualStyle}
                  onChange={e => onBrandEdit('visualStyle', e.target.value)}
                  placeholder="Premium Photoshop style, lighting, texture, background feel"
                  className="w-full h-20 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors resize-none"
                />
              </div>
              <div className="mt-4">
                <label className="text-xs text-muted-foreground mb-1 block">Flyer Size</label>
                <select
                  value={brandEdits.outputSize}
                  onChange={e => onBrandEdit('outputSize', e.target.value)}
                  className="w-full h-11 rounded-lg border border-white/[0.06] bg-[#101312] px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/40"
                >
                  {OUTPUT_SIZE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.detail}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/60">
                  Match uploaded reference keeps the closest source aspect ratio. Platform sizes guide composition and map to the nearest supported GPT-Image canvas.
                </p>
              </div>
            </div>

            {/* Essentials Card */}
            <div className="rounded-xl border border-[#8bd3ff]/20 bg-[#8bd3ff]/[0.025] p-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#8bd3ff]/10 text-[#8bd3ff]">
                  <Wand2 className="h-4 w-4" />
                </span>
                <div>
                  <h4 className="font-heading text-sm font-semibold">Essentials</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Add instructions or an exact visual asset that was not captured in the detected atoms.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {['Enter First Prompt', 'Enter Second Prompt', 'Enter Third Prompt'].map((placeholder, index) => (
                  <input
                    key={placeholder}
                    ref={node => { essentialPromptRefs.current[index] = node }}
                    value={essentialPrompts[index] || ''}
                    onChange={e => onEssentialPromptChange(index, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        essentialPromptRefs.current[Math.min(index + 1, 2)]?.focus()
                      }
                    }}
                    disabled={!essentialPrompts[index] && totalChangeCount >= 3}
                    placeholder={placeholder}
                    className="h-10 w-full rounded-lg border border-white/[0.07] bg-black/20 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-[#8bd3ff]/45 disabled:opacity-40"
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/60">
                Each filled Essential prompt uses one of the 3 available changes in this round.
              </p>
              <div className="mt-4 border-t border-white/[0.07] pt-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Essential visual</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {essentialsImage?.name || 'Logo, product, screenshot, or exact visual reference'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {essentialsImage?.dataUrl && (
                      <img src={essentialsImage.dataUrl} alt="Essentials reference" className="h-9 w-9 rounded-lg border border-white/[0.1] object-cover" />
                    )}
                    {essentialsImage && (
                      <button
                        type="button"
                        onClick={onRemoveEssentialsImage}
                        className="inline-flex h-9 items-center rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                      >
                        Remove
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => essentialsInputRef.current?.click()}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#8bd3ff]/25 bg-[#8bd3ff]/[0.06] px-3 text-xs font-semibold text-[#8bd3ff] transition-colors hover:bg-[#8bd3ff]/10"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {essentialsImage ? 'Replace' : 'Upload'}
                    </button>
                    <input
                      ref={essentialsInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) onEssentialsImageUpload(file)
                        e.currentTarget.value = ''
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Generate */}
            <div className="pt-4 pb-8 space-y-3 mt-auto">
              <button
                onClick={onGenerate}
                disabled={isGenerating}
                className="w-full inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-sm font-bold text-primary-foreground shadow-[0_18px_44px_rgba(157,250,176,0.22)] transition-all hover:shadow-[0_22px_54px_rgba(157,250,176,0.32)] hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {isGenerating ? 'Applying changes...' : totalChangeCount === 0 ? 'Select a change to continue' : totalChangeCount > 3 ? 'Reduce this round to 3 changes' : `Apply Round with AI (${totalChangeCount}/3)`}
              </button>
              {instantPasteAvailable && (
                <button
                  onClick={onInstantPaste}
                  disabled={isGenerating}
                  className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Zap className="w-4 h-4" />
                  Instant Paste — pixel-exact, no AI, no credit
                </button>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground/60">
                Uploaded images use your exact position and size. "Apply Round with AI" removes the old asset, blends the new one, and locks your uploaded pixels against model redraws.
              </p>
            </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <Wand2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="font-heading text-xl font-semibold mb-2">Upload a reference to begin</h3>
              <p className="text-sm text-muted-foreground">The design atoms panel will appear here after analysis</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Atom Card Component
   ═══════════════════════════════════════════════ */

function AtomCard({
  section, index, edit, onEdit, onImageUpload, selectionLocked, onDelete
}: {
  section: EditableComponent
  index: number
  edit?: AtomEdit
  onEdit: (id: string, mode: 'same' | 'customize', value: string) => void
  onImageUpload: (section: EditableComponent, file: File) => void
  selectionLocked: boolean
  onDelete: (sectionId: string) => void
}) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const mode = edit?.mode || 'same'
  const isImage = section.type === 'image' || /image|photo|subject|product|logo/i.test(`${section.id} ${section.name}`)
  const replacementHint = section.replacementNeeded?.[0] || section.content || `Replacement for ${section.name}`

  const typeColors: Record<string, string> = {
    text: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    image: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    style: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    action: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    brand: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    decor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    color: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  }
  const chipClass = typeColors[section.type] || typeColors.text

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-white/[0.1]" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${chipClass}`}>
            {section.type}
          </span>
          <strong className="text-sm font-semibold">{section.name}</strong>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(prev => !prev)}
            aria-label={`${section.name} options`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-muted-foreground transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-white/[0.08] bg-[#101312] p-1 shadow-2xl shadow-black/40">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete(section.id)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete card
              </button>
            </div>
          )}
        </div>
      </div>

      {(section.style || section.current?.description) && (
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{section.style || section.current?.description}</p>
      )}
      {(section.content || section.current?.text) && (
        <p className="text-xs text-muted-foreground/70 mb-3 italic">"{section.content || section.current?.text}"</p>
      )}

      {/* Same / Customize toggle */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => onEdit(section.id, 'same', edit?.value || '')}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition-colors ${mode === 'same' ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06] hover:bg-white/[0.06]'}`}
        >
          {mode === 'same' && <Check className="w-3 h-3" />} Same
        </button>
        <button
          onClick={() => onEdit(section.id, 'customize', edit?.value || '')}
          disabled={selectionLocked}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${mode === 'customize' ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06] hover:bg-white/[0.06]'}`}
        >
          Customize
        </button>
      </div>

      {/* Customize field */}
      {mode === 'customize' && (
        <div className="animate-fade-in">
          {isImage ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> {edit?.assetDataUrl ? 'Replace' : 'Upload'} Asset
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) onImageUpload(section, file)
                    e.currentTarget.value = ''
                  }}
                />
                {edit?.assetDataUrl && (
                  <img src={edit.assetDataUrl} alt="Replacement asset" className="h-9 w-9 rounded-lg border border-white/[0.1] bg-white object-contain p-1" />
                )}
                <span className="text-xs text-muted-foreground">{edit?.assetName || 'No asset selected'}</span>
              </div>
              {edit?.assetDataUrl && (
                <p className="rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2 text-[11px] leading-relaxed text-primary/90">
                  Empty logo padding is removed automatically. Move the asset on the Source, then drag any corner handle to set its exact size before reconstruction.
                </p>
              )}
              <textarea
                value={edit?.value || ''}
                onChange={e => onEdit(section.id, 'customize', e.target.value)}
                placeholder={`Optional blending note for the AI pass, e.g. "match the background lighting". Your manual position and size remain locked.`}
                className="w-full h-16 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors resize-none"
              />
            </div>
          ) : (
            <textarea
              value={edit?.value || ''}
              onChange={e => onEdit(section.id, 'customize', e.target.value)}
              placeholder={replacementHint}
              className="w-full h-16 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors resize-none"
            />
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Other Views (Gallery, Wallet, Settings)
   ═══════════════════════════════════════════════ */

type GalleryFilter = 'all' | 'generated' | 'draft'

function GalleryView({ onNewDesign }: { onNewDesign: () => void }) {
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
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search designs" className="h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.025] pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/45" />
          </label>
          <div className="grid grid-cols-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
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
              <article key={project.id} className="group min-w-0 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.025] transition-colors hover:border-primary/30">
                <div className="relative aspect-[4/5] overflow-hidden bg-[#101113]">
                  {preview ? <img src={preview} alt={project.name} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center"><Image className="h-10 w-10 text-muted-foreground/30" /></div>}
                  <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/65 px-2 py-1 text-[9px] font-semibold uppercase text-white backdrop-blur-sm sm:left-3 sm:top-3 sm:text-[10px]">
                    {project.generatedImage ? 'Generated' : 'Draft'}
                  </div>
                  <div className="absolute right-2 top-2 flex items-center gap-2 sm:right-3 sm:top-3">
                    {typeof project.qa?.score === 'number' && <div className="hidden rounded-md border border-primary/20 bg-black/65 px-2 py-1 text-[10px] font-semibold text-primary backdrop-blur-sm sm:block">{project.qa.score}% match</div>}
                    {preview && <a href={preview} download={downloadName(project)} aria-label={`Download ${project.name}`} title="Download design" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/65 text-white transition-colors hover:bg-black/85"><Download className="h-4 w-4" /></a>}
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
  { amountUSD: 5, credits: 500, label: '$5', title: 'Starter', detail: 'For focused edits and quick experiments' },
  { amountUSD: 10, credits: 1000, label: '$10', title: 'Creator', detail: 'For regular design reconstruction', recommended: true },
  { amountUSD: 25, credits: 2800, label: '$25', title: 'Studio', detail: 'Extra credits for production work' },
]

function WalletView({ onFund }: { onFund: () => void }) {
  const { user } = useAuth()
  const [balance, setBalance] = useState(0)
  const [byokEnabled, setByokEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [balanceError, setBalanceError] = useState('')
  const [activeAsset, setActiveAsset] = useState<'credits' | 'usd' | 'token'>('credits')
  const [walletNotice, setWalletNotice] = useState('')

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

  const CREDITS_PER_GENERATION = byokEnabled ? SPYDA_BYOK_ROUND_CREDITS : SPYDA_AI_ROUND_CREDITS
  const generationsRemaining = Math.floor(balance / CREDITS_PER_GENERATION)
  const fiatBalance = Number(user?.user_metadata?.spyda_fiat_balance || 0)
  const tokenBalance = Number(user?.user_metadata?.spyda_token_balance || 0)
  const walletId = user?.id ? `SPY-${user.id.slice(0, 4).toUpperCase()}-${user.id.slice(-4).toUpperCase()}` : 'SPY-GUEST'

  const assets = {
    credits: {
      id: 'credits' as const,
      name: 'Spyda Credits',
      shortName: 'Credits',
      value: balance.toLocaleString(),
      suffix: 'credits',
      status: 'Live',
      detail: 'Used for reconstruction, AI rounds, and design QA.',
      icon: <SpydaCreditIcon className="h-5 w-5" />,
    },
    usd: {
      id: 'usd' as const,
      name: 'USD Wallet',
      shortName: 'US Dollar',
      value: fiatBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      suffix: 'USD',
      status: 'Staged',
      detail: 'Web2 settlement balance for funding and payouts.',
      icon: <DollarSign className="h-5 w-5" />,
    },
    token: {
      id: 'token' as const,
      name: 'Spyda Token',
      shortName: 'Token',
      value: tokenBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      suffix: 'tokens',
      status: 'Locked',
      detail: 'Future Web3 utility and participation layer.',
      icon: <SpydaCreditIcon className="h-5 w-5" />,
    },
  }
  const selectedAsset = assets[activeAsset]

  const handleWalletAction = (action: 'fund' | 'send' | 'withdraw') => {
    if (action === 'fund') {
      onFund()
      return
    }
    if (action === 'send') {
      setWalletNotice(activeAsset === 'token'
        ? 'Spyda Token transfers will unlock with the Web3 network activation.'
        : `${selectedAsset.name} transfers are being connected to Spyda's verified transfer rails.`)
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
      <header className="flex flex-col gap-4 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase text-primary"><Radio className="h-3.5 w-3.5" /> Hybrid value layer</div>
          <h2 className="font-heading text-2xl font-semibold sm:text-[28px]">Spyda Wallet</h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">One place for design credits, fiat settlement, and Spyda's future Web3 economy.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground"><Wallet className="h-4 w-4 text-primary" /> Web2 + Web3 infrastructure</div>
      </header>

      <div className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.72fr)] lg:py-8">
        <section className="min-w-0">
          <div className="relative min-h-[288px] overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(128deg,#111315_0%,#16324a_36%,#50ef7b_70%,#d8e3ff_100%)] p-5 text-white shadow-[0_22px_65px_rgba(0,0,0,.28)] sm:p-7">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.72),rgba(0,0,0,.1)_68%,rgba(0,0,0,.28))]" />
            <div className="relative flex h-full min-h-[238px] flex-col justify-between">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-white/60">{selectedAsset.name}</p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-white/75">{selectedAsset.icon}<span>{selectedAsset.shortName}</span></div>
                </div>
              </div>
              <div className="my-7">
                <p className="font-heading text-4xl font-semibold leading-none sm:text-5xl">{loading && activeAsset === 'credits' ? <Loader2 className="h-9 w-9 animate-spin" /> : selectedAsset.value}</p>
                <p className="mt-2 text-sm font-medium text-white/70">{selectedAsset.suffix}</p>
              </div>
              <div className="flex flex-col gap-3 text-[11px] text-white/65 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="uppercase">Wallet ID</p><p className="mt-1 font-medium tracking-wide text-white/90">{walletId}</p></div>
                <div className="sm:text-right"><p className="uppercase">Account</p><p className="mt-1 max-w-[230px] truncate font-medium text-white/90">{user?.email || 'Signed out'}</p></div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => handleWalletAction('fund')} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"><ArrowDownToLine className="h-4 w-4" /> Fund</button>
            <button type="button" onClick={() => handleWalletAction('send')} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.035] text-sm font-semibold transition-colors hover:bg-white/[0.07]"><Send className="h-4 w-4" /> Send</button>
            <button type="button" onClick={() => handleWalletAction('withdraw')} aria-disabled={activeAsset === 'token'} className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors ${activeAsset === 'token' ? 'cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-muted-foreground' : 'border-white/[0.09] bg-white/[0.035] hover:bg-white/[0.07]'}`}>
              {activeAsset === 'token' ? <LockKeyhole className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />} Withdraw
            </button>
          </div>

          {walletNotice && <div role="status" className="mt-3 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/[0.055] p-4 text-sm leading-6 text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{walletNotice}</span><button type="button" aria-label="Dismiss wallet notice" onClick={() => setWalletNotice('')} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>}

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-heading text-base font-semibold">Your assets</h3><span className="text-[10px] font-semibold uppercase text-muted-foreground">Select to inspect</span></div>
            <div className="grid gap-2 md:grid-cols-3">
              {Object.values(assets).map(asset => (
                <button key={asset.id} type="button" onClick={() => { setActiveAsset(asset.id); setWalletNotice('') }} aria-pressed={activeAsset === asset.id} className={`min-h-[146px] rounded-lg border p-4 text-left transition-colors ${activeAsset === asset.id ? 'border-primary/45 bg-primary/[0.06]' : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.16]'}`}>
                  <div className="flex items-center justify-between gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-primary">{asset.icon}</span><span className="text-[9px] font-semibold uppercase text-muted-foreground">{asset.status}</span></div>
                  <p className="mt-4 text-sm font-semibold">{asset.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{asset.detail}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <section className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-center justify-between"><h3 className="font-heading text-base font-semibold">Wallet activity</h3><ReceiptText className="h-4 w-4 text-muted-foreground" /></div>
            <div className="mt-7 border-b border-dashed border-white/[0.1] pb-7 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]"><Wallet className="h-4 w-4 text-primary" /></div><p className="mt-3 text-sm font-semibold">No recent movement</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Completed funding and transfers will appear here.</p></div>
            <button type="button" onClick={onFund} className="mt-4 flex w-full items-center justify-between text-sm font-semibold text-primary">Fund your credit balance <ChevronRight className="h-4 w-4" /></button>
          </section>

          <section className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-center justify-between"><h3 className="font-heading text-base font-semibold">Usage economics</h3><Zap className="h-4 w-4 text-primary" /></div>
            <div className="mt-5 space-y-4">
              <div className="flex items-end justify-between gap-3 border-b border-white/[0.07] pb-4"><div><p className="text-xs text-muted-foreground">Managed generation</p><p className="mt-1 text-sm font-semibold">20 credits</p></div><span className="text-[10px] uppercase text-muted-foreground">per round</span></div>
              <div className="flex items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">Bring your own key</p><p className="mt-1 text-sm font-semibold">5 credits</p></div><span className="text-[10px] uppercase text-muted-foreground">per round</span></div>
            </div>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">Your current balance supports about {generationsRemaining.toLocaleString()} generation{generationsRemaining !== 1 ? 's' : ''} at the active {byokEnabled ? 'BYOK' : 'managed'} rate.</p>
          </section>

          <section className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10"><LockKeyhole className="h-4 w-4 text-primary" /></div><div><p className="text-sm font-semibold">Token withdrawal locked</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Unlocking depends on network, custody, security, and jurisdiction readiness. Spyda will never imply token liquidity before those gates pass.</p></div></div>
          </section>
        </aside>
      </div>

      {balanceError && <p className="pb-8 text-sm text-amber-400">{balanceError}</p>}
    </div>
  )
}

const USD_TO_NGN = 1500

function FundView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [balance, setBalance] = useState(0)
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

  const CREDITS_PER_GENERATION = byokEnabled ? SPYDA_BYOK_ROUND_CREDITS : SPYDA_AI_ROUND_CREDITS
  const selectedGenerations = Math.floor(selectedTier.credits / CREDITS_PER_GENERATION)
  const localPrice = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(selectedTier.amountUSD * USD_TO_NGN)

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to wallet
      </button>

      <header className="mt-5 flex flex-col gap-4 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase text-primary"><SpydaCreditIcon className="h-3.5 w-3.5" /> Live funding rail</div>
          <h2 className="font-heading text-2xl font-semibold sm:text-[28px]">Fund Spyda Credits</h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">Choose a pack or enter any amount. Every $1 adds 100 credits.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
          <Wallet className="h-4 w-4 text-primary" /> Current balance:
          <span className="font-semibold text-foreground">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `${balance.toLocaleString()} credits`}</span>
        </div>
      </header>

      <div className="py-6 lg:py-8">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {CREDIT_TIERS.map(tier => {
            const selected = selectedTier.amountUSD === tier.amountUSD && selectedTier.title === tier.title
            return (
              <button key={tier.amountUSD} type="button" onClick={() => setSelectedTier(tier)} aria-pressed={selected} className={`relative min-h-40 rounded-lg border p-5 text-left transition-colors ${selected ? 'border-primary/60 bg-primary/[0.07]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]'}`}>
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
          <label className={`relative min-h-40 cursor-text rounded-lg border p-5 text-left transition-colors ${selectedTier.title === 'Custom' ? 'border-primary/60 bg-primary/[0.07]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]'}`}>
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

        <div className="mt-6 rounded-lg border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
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
    <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.025] p-6 pb-7 sm:p-8 sm:pb-9">
      <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase text-primary">
        <Ticket className="h-4 w-4" /> Have a coupon code?
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">Redeem a Spyda coupon to instantly top up your credit balance. Each code works once.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={code}
          onChange={event => { setCode(event.target.value.toUpperCase()); if (state !== 'idle') { setState('idle'); setMessage('') } }}
          onKeyDown={event => { if (event.key === 'Enter') handleRedeem() }}
          placeholder="SPYDA-XXXX-XXXX"
          aria-label="Coupon code"
          className="h-12 flex-1 rounded-lg border border-white/[0.1] bg-background/60 px-4 font-mono text-sm uppercase tracking-wide outline-none focus:border-primary/50"
        />
        <button
          type="button"
          onClick={handleRedeem}
          disabled={state === 'redeeming'}
          className="inline-flex h-12 min-w-40 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
      disabled={paymentState === 'processing' || !paystackKey}
      onClick={() => {
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
      {paymentState === 'error' ? 'Balance update failed' : paymentState === 'success' ? 'Credits added' : !paystackKey ? 'Payment unavailable' : `Add ${tier.credits.toLocaleString()} credits`}
      {paymentState === 'idle' && paystackKey && <ArrowUpRight className="h-4 w-4" />}
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
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/5 to-transparent relative">
              <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20"></div>
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
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
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
            <p className="text-xs leading-5 text-muted-foreground mb-6">Review your current plan, access period, and billing history.</p>
            <button type="button" onClick={onManageSubscription} className="w-full inline-flex h-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
              Manage Subscription
            </button>
          </div>

          <SecurityPanel />
        </div>
      </div>
    </div>
  )
}
