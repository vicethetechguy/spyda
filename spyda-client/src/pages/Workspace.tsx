import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { parseAtomBox, clampBox, compositeReplacements, getImageSize, type AtomBox } from '../lib/design'
import type { LegacyBreakdown as BreakdownResult, LegacyEditableComponent as EditableComponent } from '../core/design-document'
import { usePaystackPayment } from 'react-paystack'
import SidebarNav from '../components/ui/dashboard-sidebar'
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
  ChevronUp,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  ShieldCheck,
  ArrowLeft,
  Search,
  Grid2X2,
  Clock3,
  Coins,
  CreditCard,
  ArrowUpRight,
  CircleCheck,
  ReceiptText
} from 'lucide-react'

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
  passed?: boolean
  retried?: boolean
  score?: number
  layoutMatch?: string
  textMatch?: string
  assetMatch?: string
  sizeMatch?: string
  issues?: string[]
  suggestions?: string[]
  error?: string
}

type SavedSpydaProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  referencePreview?: string | null
  generatedImage?: string | null
  breakdown?: BreakdownResult | null
  atomEdits?: Record<string, AtomEdit>
  brandEdits?: {
    headingFont: string
    bodyFont: string
    primaryColor: string
    secondaryColor: string
    accentColor: string
    visualStyle: string
    essentials: string
    outputSize: string
  }
  qa?: GenerationQaReport | null
}

/* ═══════════════════════════════════════════════
   Main Workspace
   ═══════════════════════════════════════════════ */

type AtomEdit = {
  mode: 'same' | 'customize'
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
      img.onerror = (error: any) => reject(error)
    }
    reader.onerror = (error: any) => reject(error)
  })
}

function imageFileToBlob(file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.86, mimeType = 'image/jpeg'): Promise<Blob> {
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
        canvas.toBlob(blob => {
          if (blob) resolve(blob)
          else reject(new Error('Could not prepare image for generation.'))
        }, mimeType, quality)
      }
      img.onerror = (error: any) => reject(error)
    }
    reader.onerror = (error: any) => reject(error)
  })
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)
  return response.blob()
}

function imageSourceToBlob(imageSrc: string, maxWidth = 1024, maxHeight = 1024, quality = 0.82, mimeType = 'image/jpeg'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.naturalWidth || img.width
      let height = img.naturalHeight || img.height

      if (width > maxWidth || height > maxHeight) {
        const scale = Math.min(maxWidth / width, maxHeight / height)
        width *= scale
        height *= scale
      }

      canvas.width = Math.max(1, Math.round(width))
      canvas.height = Math.max(1, Math.round(height))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not prepare image for generation.'))
        return
      }

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Could not prepare image for generation.'))
      }, mimeType, quality)
    }
    img.onerror = (error: any) => reject(error)
    img.src = imageSrc
  })
}

function getImageDimensionsFromFile(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new window.Image()
      img.src = event.target?.result as string
      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
      img.onerror = (error: any) => reject(error)
    }
    reader.onerror = (error: any) => reject(error)
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
    img.onerror = (error: any) => reject(error)
    img.src = imageSrc
  })
}

function getImageSizeChoice(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new window.Image()
      img.src = event.target?.result as string
      img.onload = () => {
        const ratio = img.width / Math.max(1, img.height)
        if (ratio > 1.12) resolve('Landscape 1536 x 1024')
        else if (ratio < 0.9) resolve('Portrait 1024 x 1536')
        else resolve('Square 1024 x 1024')
      }
      img.onerror = (error: any) => reject(error)
    }
    reader.onerror = (error: any) => reject(error)
  })
}

async function readApiJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || `Server returned ${response.status}.`)
    }
    return payload as T
  }

  const text = await response.text()
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
  const [generationQa, setGenerationQa] = useState<GenerationQaReport | null>(null)
  const [analysisStage, setAnalysisStage] = useState('')
  const [generationStage, setGenerationStage] = useState('')
  const [essentialPrompts, setEssentialPrompts] = useState(['', '', ''])
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Atom edits — keyed by section id
  const [atomEdits, setAtomEdits] = useState<Record<string, AtomEdit>>({})

  // Brand card state
  const [brandEdits, setBrandEdits] = useState<{
    headingFont: string
    bodyFont: string
    primaryColor: string
    secondaryColor: string
    accentColor: string
    visualStyle: string
    essentials: string
    outputSize: string
  }>({
    headingFont: 'Space Grotesk',
    bodyFont: 'Montserrat',
    primaryColor: '#0F172A',
    secondaryColor: '#22C55E',
    accentColor: '#F8FAFC',
    visualStyle: '',
    essentials: '',
    outputSize: 'match-reference',
  })

  // Populate brand edits from breakdown
  useEffect(() => {
    if (breakdown?.design?.styleTokens) {
      const c = breakdown.design.styleTokens
      setBrandEdits(prev => ({
        headingFont: c.typography?.headingFont || c.headingFont || prev.headingFont,
        bodyFont: c.typography?.bodyFont || c.bodyFont || prev.bodyFont,
        primaryColor: normalizeHexColor(c.palette?.primary || c.colors?.primary || '', prev.primaryColor),
        secondaryColor: normalizeHexColor(c.palette?.secondary || c.colors?.secondary || '', prev.secondaryColor),
        accentColor: normalizeHexColor(c.palette?.accent || c.colors?.accent || '', prev.accentColor),
        visualStyle: c.visualStyle || prev.visualStyle,
        essentials: prev.essentials,
        outputSize: prev.outputSize,
      }))
    }
  }, [breakdown])

  const pageTitles: Record<string, string> = {
    canvas: 'Canvas',
    'qa-gate': 'QA Gate',
    gallery: 'Gallery',
    history: 'History',
    projects: 'Projects',
    templates: 'Templates',
    'brand-assets': 'Brand Assets',
    wallet: 'Wallet',
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
      referencePreview: updates.referencePreview ?? existing?.referencePreview ?? uploadedPreview,
      generatedImage: updates.generatedImage ?? existing?.generatedImage ?? generatedImage,
      breakdown: updates.breakdown ?? existing?.breakdown ?? breakdown,
      atomEdits: updates.atomEdits ?? existing?.atomEdits ?? atomEdits,
      brandEdits: updates.brandEdits ?? existing?.brandEdits ?? brandEdits,
      qa: updates.qa ?? existing?.qa ?? generationQa,
    })
  }, [atomEdits, brandEdits, breakdown, currentProjectId, generatedImage, generationQa, uploadedFile, uploadedPreview])

  const handleDesignUpload = useCallback(async (file: File) => {
    const projectId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `spyda-${Date.now()}`
    setUploadedFile(file)
    setUploadedPreview(URL.createObjectURL(file))
    setCurrentProjectId(projectId)
    setBreakdown(null)
    setGeneratedImage(null)
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
        const sourceDimensions = await getImageDimensionsFromFile(file)
        const base64Image = await imageFileToDataUrl(file, 1024, 1024, 0.82);
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
          headers: { 'Content-Type': 'application/json' },
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
  }, [aiModel, brandEdits])

  /* ── Generate handler ── */
  const handleAtomImageUpload = useCallback(async (section: EditableComponent, file: File) => {
    // PNG keeps logo/asset transparency intact for exact-size compositing
    const assetDataUrl = await imageFileToDataUrl(file, 1024, 1024, 0.92, 'image/png')
    const assetName = file.name
    setAtomEdits(prev => ({
      ...prev,
      [section.id]: {
        ...prev[section.id],
        mode: 'customize',
        value: prev[section.id]?.value || '',
        assetName,
        assetDataUrl,
      },
    }))
  }, [])

  const handleEssentialsImageUpload = useCallback(async (file: File) => {
    const dataUrl = await imageFileToDataUrl(file, 768, 768, 0.78)
    setEssentialsImage({ name: file.name, dataUrl })
  }, [])

  const handleDeleteAtom = useCallback((sectionId: string) => {
    setBreakdown(prev => {
      if (!prev) return prev
      return {
        ...prev,
        design: {
          ...prev.design,
          editableComponents: (prev.design.editableComponents || []).map(section =>
            section.id === sectionId ? { ...section, deleted: true } : section
          ),
        }
      }
    })
    setAtomEdits(prev => {
      const next = { ...prev }
      delete next[sectionId]
      return next
    })
  }, [])

  const handleGenerate = useCallback(async (options?: { instant?: boolean }) => {
    if (!uploadedFile || !breakdown) return
    const selectedAtoms = (breakdown.design?.editableComponents || [])
      .filter(s => !s.deleted && atomEdits[s.id]?.mode === 'customize')
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
      const activeSourcePreview = generatedImage || uploadedPreview || ''
      const sourceDimensions = await getImageDimensionsFromFile(uploadedFile)
      const sourceImageSize = await getImageSizeChoice(uploadedFile)
      const chosenOutputSize = brandEdits.outputSize === 'match-reference' ? sourceImageSize : brandEdits.outputSize
      const previewSize = await getImageSize(activeSourcePreview)

      // ── Partition the selected changes ──
      // Replacement images with a numeric atom box get placed deterministically
      // on a canvas (pixel math — sizing can never drift). Everything else
      // becomes a short, focused instruction for the AI pass.
      const placedSwaps: Array<{ section: EditableComponent; edit: AtomEdit; box: AtomBox }> = []
      const unplacedAssets: Array<{ section: EditableComponent; edit: AtomEdit }> = []
      const textEdits: Array<{ atomName: string; from: string; to: string }> = []
      const otherEdits: Array<{ atomName: string; instruction: string }> = []

      for (const section of selectedAtoms) {
        const edit = atomEdits[section.id]
        if (!edit) continue
        if (edit.assetDataUrl) {
          const box = edit.box || parseAtomBox(section.boundingBox, previewSize)
          if (box) placedSwaps.push({ section, edit, box: clampBox(box) })
          else unplacedAssets.push({ section, edit })
        } else if (edit.value.trim()) {
          if (section.type === 'text' || section.type === 'action') {
            textEdits.push({ atomName: section.name, from: section.content, to: edit.value.trim() })
          } else {
            otherEdits.push({ atomName: section.name, instruction: edit.value.trim() })
          }
        }
      }

      // ── Brand overrides only when the user actually changed them ──
      // Analyzed style tokens are the design's own DNA; forcing default brand
      // constants onto every round is what used to recolor faithful outputs.
      const tokens = breakdown.design?.styleTokens || {}
      const analyzedBrand = {
        headingFont: tokens.typography?.headingFont || tokens.headingFont || '',
        bodyFont: tokens.typography?.bodyFont || tokens.bodyFont || '',
        primaryColor: normalizeHexColor(tokens.palette?.primary || tokens.colors?.primary || '', ''),
        secondaryColor: normalizeHexColor(tokens.palette?.secondary || tokens.colors?.secondary || '', ''),
        accentColor: normalizeHexColor(tokens.palette?.accent || tokens.colors?.accent || '', ''),
        visualStyle: tokens.visualStyle || '',
      }
      const brandOverrides: Record<string, string> = {}
      if (brandEdits.headingFont && brandEdits.headingFont !== analyzedBrand.headingFont) brandOverrides.headingFont = brandEdits.headingFont
      if (brandEdits.bodyFont && brandEdits.bodyFont !== analyzedBrand.bodyFont) brandOverrides.bodyFont = brandEdits.bodyFont
      if (brandEdits.primaryColor && brandEdits.primaryColor.toUpperCase() !== analyzedBrand.primaryColor.toUpperCase()) brandOverrides.primaryColor = brandEdits.primaryColor
      if (brandEdits.secondaryColor && brandEdits.secondaryColor.toUpperCase() !== analyzedBrand.secondaryColor.toUpperCase()) brandOverrides.secondaryColor = brandEdits.secondaryColor
      if (brandEdits.accentColor && brandEdits.accentColor.toUpperCase() !== analyzedBrand.accentColor.toUpperCase()) brandOverrides.accentColor = brandEdits.accentColor
      if (brandEdits.visualStyle.trim() && brandEdits.visualStyle.trim() !== analyzedBrand.visualStyle.trim()) brandOverrides.visualStyle = brandEdits.visualStyle.trim()
      const hasBrandOverrides = Object.keys(brandOverrides).length > 0

      // ── Deterministic placement: bake replacements into the parent ──
      setGenerationStage(placedSwaps.length ? 'Placing replacements at exact size' : 'Preparing design')
      const compositeDataUrl = placedSwaps.length
        ? await compositeReplacements(activeSourcePreview, placedSwaps.map(swap => ({ box: swap.box, src: swap.edit.assetDataUrl! })))
        : activeSourcePreview

      const finalizeRound = async (imageSrc: string, qa: GenerationQaReport | null) => {
        const normalizedImageSrc = await resizeImageToDimensions(imageSrc, sourceDimensions.width, sourceDimensions.height)
        setGeneratedImage(normalizedImageSrc)
        setGenerationQa(qa)
        persistCurrentProject({
          id: currentProjectId || undefined,
          name: uploadedFile.name || 'Spyda generated design',
          referencePreview: uploadedPreview,
          generatedImage: normalizedImageSrc,
          breakdown,
          atomEdits,
          brandEdits,
          qa,
        })
        setBreakdown(prev => {
          if (!prev) return prev
          const selectedIds = new Set(selectedAtoms.map(atom => atom.id))
          return {
            ...prev,
            design: {
              ...prev.design,
              editableComponents: (prev.design.editableComponents || []).map(atom =>
                selectedIds.has(atom.id) ? { ...atom, deleted: true } : atom
              ),
            },
          }
        })
        setAtomEdits(prev => {
          const next = { ...prev }
          for (const atom of selectedAtoms) delete next[atom.id]
          return next
        })
        setEssentialPrompts(['', '', ''])
      }

      const needsAi = Boolean(textEdits.length || otherEdits.length || filledEssentials.length || hasBrandOverrides || unplacedAssets.length || essentialsImage)

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
          issues: [],
          suggestions: [],
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
        aiProvider: aiModel.provider,
        imageSize: chosenOutputSize,
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
          name: swap.edit.assetName || 'Replacement asset',
          atomName: swap.section.name,
          box: swap.box,
        })),
        textEdits,
        otherEdits,
        brandOverrides: hasBrandOverrides ? brandOverrides : null,
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

      setGenerationStage('Sending design to GPT-Image')
      const form = new FormData()
      form.append('recipe', JSON.stringify(recipe))
      const childSourceBlob = await imageSourceToBlob(compositeDataUrl, 1024, 1536, 0.85)
      form.append('childSourceImage', childSourceBlob, 'working-design.jpg')
      if (essentialsImage) {
        const essentialsBlob = await imageSourceToBlob(essentialsImage.dataUrl, 768, 768, 0.78)
        form.append('essentialsImage', essentialsBlob, essentialsImage.name || 'essentials-reference.jpg')
      }
      for (const image of referenceImages) {
        const blob = await imageSourceToBlob(image.dataUrl, 768, 768, 0.78)
        form.append(image.fieldName, blob, image.name || `${image.sectionId}.jpg`)
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        body: form,
      })
      const data = await readApiJson<ApiGenerateResponse>(res)

      if (data?.ok && data?.image) {
        setGenerationStage(data.qa ? 'Checking reference match' : 'Finalizing design')
        const imageSrc = data.image.startsWith('http') ? data.image : `data:image/png;base64,${data.image}`
        await finalizeRound(imageSrc, data.qa || null)
      } else if (data?.ok && !data?.image) {
        setGenerateError(data?.message || 'Generation returned no image (mock mode — set OPENAI_API_KEY).')
      } else {
        setGenerateError(data?.error || 'Generation failed.')
      }
    } catch (err: any) {
      const message = String(err?.message || '')
      setGenerateError(
        message === 'Failed to fetch'
          ? 'The generation request could not reach the server. Refresh and try again. If it repeats, use fewer large replacement images in that round.'
          : message || 'Generation request could not reach the server. Refresh and try again with smaller replacement images.'
      )
    } finally {
      setGenerationStage('')
      setIsGenerating(false)
    }
  }, [uploadedFile, breakdown, atomEdits, brandEdits, essentialsImage, aiModel, currentProjectId, uploadedPreview, generatedImage, essentialPrompts, persistCurrentProject])

  /* ── Reset handler ── */
  const handleReset = useCallback(() => {
    setUploadedFile(null)
    setUploadedPreview(null)
    setCurrentProjectId(null)
    setEssentialsImage(null)
    setBreakdown(null)
    setGeneratedImage(null)
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
    })
  }, [])

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
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
      <div className="flex-1 flex flex-col min-w-0">
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
                  title="Open QA Gate"
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
        <div className={`flex-1 flex flex-col ${activeId === 'canvas' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {activeId === 'canvas' && (
            <StudioView
              uploadedFile={uploadedFile}
              uploadedPreview={uploadedPreview}
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
              uploadedPreview={uploadedPreview}
              onBack={() => setActiveId('canvas')}
              onApplyEssentials={(essentials) => {
                setEssentialPrompts([essentials[0] || '', essentials[1] || '', essentials[2] || ''])
                setActiveId('canvas')
              }}
            />
          )}
          {activeId === 'gallery' && <GalleryView onNewDesign={() => setActiveId('canvas')} />}
          {activeId === 'wallet' && <WalletView />}
          {activeId === 'settings' && <SettingsView profilePic={profilePic} setProfilePic={setProfilePic} />}
          {!['canvas', 'qa-gate', 'gallery', 'wallet', 'settings'].includes(activeId) && <PlaceholderView title={activeTitle} />}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   QA Gate View
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

  for (const suggestion of qa.suggestions || []) push(suggestion)
  for (const issue of qa.issues || []) push(`Fix this from the last generation: ${issue}`)

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
  const suggestedEssentials = deriveQaEssentials(qa)
  const hasReport = Boolean(qa && !qa.skipped)
  const failed = hasReport && qa?.passed === false

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-8 animate-fade-in">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Canvas
      </button>

      {!hasReport ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] py-20 text-center px-6">
          <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mb-4" strokeWidth={1.25} />
          <h2 className="text-lg font-semibold">No QA report yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Generate a design on the Canvas and Spyda will automatically compare it against the parent design — layout, text, assets, and replacement sizing — then report the results here.
          </p>
          {qa?.error && <p className="mt-3 text-xs text-amber-500">Last QA attempt failed: {qa.error}</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Verdict */}
          <div className={`rounded-2xl border px-5 py-4 ${failed ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-primary/20 bg-primary/[0.04]'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className={`w-5 h-5 ${failed ? 'text-amber-500' : 'text-primary'}`} strokeWidth={1.75} />
                <span className={`text-sm font-bold ${failed ? 'text-amber-600' : 'text-primary'}`}>
                  {failed ? 'Issues Found' : 'Passed'}
                  {qa?.retried ? ' • Auto-retried' : ''}
                </span>
              </div>
              {typeof qa?.score === 'number' && (
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${failed ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'}`}>{qa.score}/100</span>
              )}
            </div>
            {failed && (
              <p className="mt-2 text-xs text-amber-600">
                The generated design did not fully match the parent design. Apply the suggested Essentials below, then regenerate.
              </p>
            )}
          </div>

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

          {/* Issues */}
          {!!qa?.issues?.length && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-muted-foreground mb-2">Detected Issues</p>
              <ul className="space-y-1.5">
                {qa.issues.map((issue, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-foreground/85">
                    <X className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" /> {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested corrective essentials */}
          {!!suggestedEssentials.length && (
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
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Placement Canvas — deterministic replacement placement
   Shows detected atom regions over the parent design and
   live-previews replacement assets at their exact final
   footprint. Drag to move, corner handle to resize — what
   you see here is pixel-for-pixel what gets baked in.
   ═══════════════════════════════════════════════ */

function PlacementCanvas({
  src, atoms, atomEdits, isAnalyzing, analysisStage, onBoxChange,
}: {
  src: string
  atoms: EditableComponent[]
  atomEdits: Record<string, AtomEdit>
  isAnalyzing: boolean
  analysisStage: string
  onBoxChange: (id: string, box: AtomBox) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [showAtomMap, setShowAtomMap] = useState(false)
  const dragRef = useRef<{
    id: string
    mode: 'move' | 'resize'
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

  const startDrag = (event: React.PointerEvent, id: string, mode: 'move' | 'resize', box: AtomBox) => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    event.stopPropagation()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    dragRef.current = { id, mode, startX: event.clientX, startY: event.clientY, box, rectW: rect.width, rectH: rect.height }
  }

  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = ((event.clientX - drag.startX) / drag.rectW) * 100
    const dy = ((event.clientY - drag.startY) / drag.rectH) * 100
    onBoxChange(drag.id, clampBox(drag.mode === 'move'
      ? { ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy }
      : { ...drag.box, width: drag.box.width + dx, height: drag.box.height + dy }))
  }

  const endDrag = () => { dragRef.current = null }

  return (
    <div className="relative flex h-[340px] items-center justify-center rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
      <div ref={wrapperRef} className="relative">
        <img
          src={src}
          alt="Active parent source flyer"
          className="block max-h-[336px] max-w-full object-contain"
          onLoad={event => setNaturalSize({
            width: event.currentTarget.naturalWidth || event.currentTarget.width,
            height: event.currentTarget.naturalHeight || event.currentTarget.height,
          })}
        />

        {/* Detected atom map */}
        {showAtomMap && mappedAtoms.map(({ atom, box }) => (
          <div
            key={`map-${atom.id}`}
            className="group absolute rounded-[3px] border border-cyan-300/40 bg-cyan-300/[0.04] hover:border-cyan-300/80 hover:bg-cyan-300/10 transition-colors"
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}
          >
            <span className="pointer-events-none absolute -top-5 left-0 hidden whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200 group-hover:block">
              {atom.name}
            </span>
          </div>
        ))}

        {/* Live replacement placement — draggable + resizable */}
        {placedReplacements.map(({ atom, box }) => (
          <div
            key={`placed-${atom.id}`}
            className="absolute cursor-move rounded-[3px] border-2 border-primary/80 bg-black/10 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%`, touchAction: 'none' }}
            onPointerDown={event => startDrag(event, atom.id, 'move', box)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <img
              src={atomEdits[atom.id]?.assetDataUrl}
              alt={`${atom.name} replacement preview`}
              className="pointer-events-none h-full w-full object-contain"
              draggable={false}
            />
            <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
              {atom.name} — exact size
            </span>
            <span
              className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-black/40 bg-primary"
              style={{ touchAction: 'none' }}
              onPointerDown={event => startDrag(event, atom.id, 'resize', box)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          </div>
        ))}
      </div>

      {/* Atom map toggle */}
      {!isAnalyzing && mappedAtoms.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAtomMap(prev => !prev)}
          className={`absolute top-3 right-3 inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${showAtomMap ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200' : 'border-white/[0.1] bg-black/50 text-muted-foreground hover:text-foreground'}`}
        >
          {showAtomMap ? 'Hide atom map' : 'Show atom map'}
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
  generationQa, analysisStage, generationStage,
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
  brandEdits: {
    headingFont: string
    bodyFont: string
    primaryColor: string
    secondaryColor: string
    accentColor: string
    visualStyle: string
    essentials: string
    outputSize: string
  }
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
  onBrandEdit: (field: string, value: string) => void
  onEssentialPromptChange: (index: number, value: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const essentialsInputRef = useRef<HTMLInputElement>(null)
  const essentialPromptRefs = useRef<Array<HTMLInputElement | null>>([])
  const [isDragging, setIsDragging] = useState(false)
  const [atomsDrawerOpen, setAtomsDrawerOpen] = useState(false)
  const [desktopAtomsPanel, setDesktopAtomsPanel] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024)

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
  const visibleSections = breakdown?.design?.editableComponents?.filter(s => !s.deleted) || []
  const selectedSections = visibleSections.filter(section => atomEdits[section.id]?.mode === 'customize')
  const selectedAtomCount = selectedSections.length
  const essentialCount = essentialPrompts.filter(prompt => prompt.trim()).length
  const essentialVisualSlots = essentialsImage && essentialCount === 0 ? 1 : 0
  const totalChangeCount = selectedAtomCount + essentialCount + essentialVisualSlots
  const remainingChangeCount = Math.max(0, 3 - totalChangeCount)
  const canApplyRound = totalChangeCount >= 1 && totalChangeCount <= 3
  const activeSourcePreview = generatedImage || uploadedPreview
  const activeSourceName = generatedImage ? 'Latest generated parent' : uploadedFile.name
  const placedSwapCount = selectedSections.filter(section => atomEdits[section.id]?.assetDataUrl).length
  // Instant paste: every selected change is an image swap and nothing needs the AI pass
  const instantPasteAvailable = placedSwapCount > 0
    && placedSwapCount === selectedAtomCount
    && selectedSections.every(section => !atomEdits[section.id]?.value?.trim())
    && essentialCount === 0
    && !essentialsImage

  return (
    <div className="flex-1 min-h-0 h-full w-full flex flex-col lg:flex-row lg:items-stretch">
      {/* Left: Source + Child Source */}
      <div className="min-h-0 w-full flex-1 shrink-0 overflow-y-auto border-r border-white/[0.06] flex flex-col lg:w-[45%] lg:flex-none">
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
            onBoxChange={onAtomBoxChange}
          />
          {placedSwapCount > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">
              Replacements are shown at their exact final size, baked in by Spyda before the AI ever sees the design. Drag to reposition, use the corner handle to resize.
            </p>
          )}
          {analyzeError && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {analyzeError}
            </div>
          )}
        </div>

        {/* Child Source */}
        <div className="flex-1 p-6 flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary">Child Source</span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
              {totalChangeCount}/3 changes ready
            </span>
          </div>
          {generatedImage || uploadedPreview ? (
            <div className="relative flex h-[340px] w-full items-center justify-center rounded-xl overflow-hidden border border-primary/20 bg-white/[0.02]">
              <img src={generatedImage || uploadedPreview || ''} alt="Child source design" className="h-full w-full object-contain" />
              {generatedImage && <a
                href={generatedImage}
                download={`spyda-output-${Date.now()}.png`}
                className="absolute bottom-4 right-4 inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-4 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 transition-all"
              >
                <Download className="w-4 h-4" /> Download 4K
              </a>}
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
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary">Brand Constants</span>
              </div>
              <p className="-mt-2 mb-4 text-[11px] leading-relaxed text-muted-foreground/70">
                Pre-filled from the analyzed design. They only restyle the flyer when you change them — leave them untouched to keep the parent design's exact look.
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
                Replacement images are always placed at the original atom's exact size before generation. "Apply Round with AI" additionally blends edges, applies text changes, and any brand or Essential instructions.
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
                  <img src={edit.assetDataUrl} alt="Replacement asset" className="w-9 h-9 rounded-lg object-cover border border-white/[0.1]" />
                )}
                <span className="text-xs text-muted-foreground">{edit?.assetName || 'No asset selected'}</span>
              </div>
              {edit?.assetDataUrl && (
                <p className="rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2 text-[11px] leading-relaxed text-primary/90">
                  Placed on the Source preview at the original atom's exact size. Drag it there to reposition, or use the corner handle to resize.
                </p>
              )}
              <textarea
                value={edit?.value || ''}
                onChange={e => onEdit(section.id, 'customize', e.target.value)}
                placeholder={`Optional blending note for the AI pass, e.g. "match the background lighting". Position and size are already locked.`}
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

const CREDIT_TIERS: CreditTier[] = [
  { amountUSD: 5, credits: 500, label: '$5', title: 'Starter', detail: 'For focused edits and quick experiments' },
  { amountUSD: 10, credits: 1000, label: '$10', title: 'Creator', detail: 'For regular design reconstruction', recommended: true },
  { amountUSD: 25, credits: 2800, label: '$25', title: 'Studio', detail: 'Extra credits for production work' },
]

function WalletView() {
  const { user } = useAuth()
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [balanceError, setBalanceError] = useState('')
  const [selectedTier, setSelectedTier] = useState<CreditTier>(CREDIT_TIERS[1])

  useEffect(() => {
    async function fetchBalance() {
      if (!user) {
        setLoading(false)
        return
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('wallet_balance')
          .eq('id', user.id)
          .single()

        if (error) throw error
        setBalance(Number(data?.wallet_balance || 0))
      } catch (err) {
        console.error('Error fetching balance:', err)
        setBalanceError('We could not refresh your balance. Try again shortly.')
      } finally {
        setLoading(false)
      }
    }
    fetchBalance()
  }, [user])

  const USD_TO_NGN = 1500
  const CREDITS_PER_GENERATION = 12
  const generationsRemaining = Math.floor(balance / CREDITS_PER_GENERATION)
  const selectedGenerations = Math.floor(selectedTier.credits / CREDITS_PER_GENERATION)
  const localPrice = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(selectedTier.amountUSD * USD_TO_NGN)

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="border-b border-white/[0.07] pb-6">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground"><Coins className="h-3.5 w-3.5 text-primary" /> Spyda credits</div>
        <h2 className="font-heading text-2xl font-semibold sm:text-[28px]">Wallet and billing</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Keep your design workflow moving and top up only when you need to.</p>
      </div>

      <section className="grid gap-5 border-b border-white/[0.07] py-6 md:grid-cols-[1.35fr_1fr] md:items-end lg:py-8">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Available balance</p>
          <div className="mt-3 flex min-h-14 items-end gap-3">
            {loading ? <Loader2 className="mb-2 h-8 w-8 animate-spin text-primary" /> : <span className="font-heading text-5xl font-semibold leading-none sm:text-6xl">{balance.toLocaleString()}</span>}
            <span className="mb-1 text-sm font-medium text-primary sm:mb-2">credits</span>
          </div>
          {balanceError ? <p className="mt-3 text-sm text-amber-400">{balanceError}</p> : <p className="mt-3 text-sm text-muted-foreground">Enough for approximately {generationsRemaining.toLocaleString()} design generation{generationsRemaining !== 1 ? 's' : ''}.</p>}
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08]">
          <div className="bg-background p-4"><Zap className="mb-3 h-4 w-4 text-primary" /><p className="text-[11px] uppercase text-muted-foreground">Generation rate</p><p className="mt-1 font-heading text-lg font-semibold">{CREDITS_PER_GENERATION} credits</p></div>
          <div className="bg-background p-4"><ReceiptText className="mb-3 h-4 w-4 text-primary" /><p className="text-[11px] uppercase text-muted-foreground">Billing account</p><p className="mt-1 truncate text-sm font-semibold" title={user?.email || ''}>{user?.email || 'Signed out'}</p></div>
        </div>
      </section>

      <section className="py-6 lg:py-8">
        <div className="flex items-end justify-between gap-4">
          <div><h3 className="font-heading text-lg font-semibold">Choose a credit pack</h3><p className="mt-1 text-sm text-muted-foreground">Credits stay available in your Spyda account.</p></div>
          <CreditCard className="hidden h-5 w-5 text-muted-foreground sm:block" />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {CREDIT_TIERS.map(tier => {
            const selected = selectedTier.amountUSD === tier.amountUSD
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
                <p className="mt-4 text-sm font-semibold text-primary">{tier.credits.toLocaleString()} credits</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{tier.detail}</p>
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex flex-col gap-4 border-t border-white/[0.07] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold">{selectedTier.credits.toLocaleString()} credits <span className="font-normal text-muted-foreground">· about {selectedGenerations} generations</span></p><p className="mt-1 text-xs text-muted-foreground">Charged as {localPrice} through Paystack.</p></div>
          <PaystackTopUpButton tier={selectedTier} user={user} balance={balance} setBalance={setBalance} usdToNgn={USD_TO_NGN} />
        </div>
        <div className="mt-6 flex items-start gap-3 border-t border-white/[0.07] pt-5 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Payments are processed securely by Paystack. Your card details are never stored by Spyda.</div>
      </section>
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

function SettingsView({ profilePic, setProfilePic }: { profilePic: string | null, setProfilePic: (url: string | null) => void }) {
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
        const { data, error } = await supabase
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
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        display_name: formData.display_name,
        brand_name: formData.brand_name,
        openai_key: formData.openai_key,
        groq_key: formData.groq_key,
        avatar_url: profilePic,
        updated_at: new Date().toISOString()
      })
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
                <p className="text-[11px] text-muted-foreground mt-2">Required for custom image generation and design breakdown.</p>
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
            <div className="text-3xl font-heading font-bold text-foreground mb-1">Pro</div>
            <p className="text-xs text-muted-foreground mb-6">Active subscription</p>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Credits Usage</span>
                <span className="font-medium text-foreground">84%</span>
              </div>
              <div className="h-1.5 w-full bg-background rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[84%] rounded-full"></div>
              </div>
              <p className="text-[10px] text-muted-foreground text-right">Reset in 12 days</p>
            </div>
            <button className="w-full inline-flex h-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
              Manage Subscription
            </button>
          </div>
          
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <h4 className="font-heading text-sm font-bold mb-4">Security</h4>
            <div className="space-y-4">
              <button className="w-full flex items-center justify-between py-2 text-sm text-foreground hover:text-primary transition-colors">
                <span>Change Password</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="w-full flex items-center justify-between py-2 text-sm text-foreground hover:text-primary transition-colors">
                <span>Two-Factor Auth</span>
                <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">Off</span>
              </button>
              <button className="w-full flex items-center justify-between py-2 text-sm text-foreground hover:text-primary transition-colors">
                <span>Active Sessions</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
        <Wand2 className="w-7 h-7 text-muted-foreground/40" strokeWidth={1.5} />
      </div>
      <h2 className="font-heading text-2xl font-bold mb-2">{title}</h2>
      <p className="text-muted-foreground text-sm">This section is coming soon.</p>
    </div>
  )
}
