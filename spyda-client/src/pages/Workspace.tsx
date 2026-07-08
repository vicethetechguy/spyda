import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
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
  Trash2
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

type EditableComponent = {
  id: string
  name: string
  type: string
  editable: boolean
  content: string
  style: string
  layerIndex: number
  boundingBox: string
  sectionId: string
  deleted?: boolean
  current?: any // Keep for backward compatibility with old mocks if needed
  replacementNeeded?: string[] // Keep for backward compatibility
}

type StyleTokens = {
  palette?: { primary?: string; secondary?: string; accent?: string }
  typography?: { headingFont?: string; bodyFont?: string }
  spacing?: string
  shadows?: string
  gradients?: string
  effects?: string
  borderRadius?: string
  lighting?: string
  // Legacy aliases
  colors?: { primary?: string; secondary?: string; accent?: string }
  headingFont?: string
  bodyFont?: string
  visualStyle?: string
}

type BreakdownResult = {
  design: {
    metadata?: { aspectRatio?: string; orientation?: string; colorSpace?: string }
    sections?: Array<{ id: string; name: string; bounds: string }>
    styleTokens: StyleTokens
    editableComponents: EditableComponent[]
  }
}

type ApiAnalyzeResponse = {
  ok: boolean
  mode?: string
  breakdown?: any
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
}

type GenerationReferenceImage = {
  sectionId: string
  sectionName: string
  sectionType: string
  name: string
  fieldName: string
  dataUrl: string
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
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
          body: JSON.stringify({ base64Image, aiProvider: aiModel.provider })
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
    const assetDataUrl = await imageFileToDataUrl(file, 512, 512, 0.72)
    const assetName = file.name
    setAtomEdits(prev => ({
      ...prev,
      [section.id]: {
        mode: 'customize',
        value: prev[section.id]?.value || `Use uploaded reference image "${assetName}" for ${section.name}. Preserve this asset's identity, logo mark, subject, colors, and placement intent.`,
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

  const handleGenerate = useCallback(async () => {
    if (!uploadedFile || !breakdown) return
    const selectedAtoms = (breakdown.design?.editableComponents || [])
      .filter(s => !s.deleted && atomEdits[s.id]?.mode === 'customize')
    const filledEssentials = essentialPrompts.map(prompt => prompt.trim()).filter(Boolean)
    const totalChanges = selectedAtoms.length + filledEssentials.length

    if (totalChanges !== 3) {
      setGenerateError('Choose exactly 3 changes before applying this round.')
      return
    }

    setIsGenerating(true)
    setGenerationQa(null)
    setGenerationStage('Preparing source and child references')
    setGenerateError(null)

    try {
      // Build recipe from atoms + brand card
      const activeSourcePreview = generatedImage || uploadedPreview || ''
      const sourceReferenceBlob = generatedImage
        ? await imageSourceToBlob(generatedImage, 900, 1350, 0.76)
        : await imageFileToBlob(uploadedFile, 768, 1152, 0.72)
      const childSourceBlob = await imageSourceToBlob(activeSourcePreview, 900, 1350, 0.76)
      const sourceDimensions = await getImageDimensionsFromFile(uploadedFile)
      const sourceImageSize = await getImageSizeChoice(uploadedFile)
      const chosenOutputSize = brandEdits.outputSize === 'match-reference' ? sourceImageSize : brandEdits.outputSize
      const activeSourceName = generatedImage ? 'Latest generated parent design' : (uploadedFile.name || 'Uploaded reference flyer')
      const referenceImages = selectedAtoms
        .map(s => {
          const edit = atomEdits[s.id]
          if (!edit?.assetDataUrl) return null
          return {
            sectionId: s.id,
            sectionName: s.name,
            sectionType: s.type,
            name: edit.assetName || `${s.name} reference image`,
            fieldName: `referenceImage-${s.id}`,
            dataUrl: edit.assetDataUrl,
          }
        })
        .filter(isGenerationReferenceImage)
        .slice(0, 5)

      const recipe: Record<string, any> = {
        aiProvider: aiModel.provider,
        imageSize: chosenOutputSize,
        sourceImageSize,
        sourceDimensions,
        outputSizeLabel: OUTPUT_SIZE_OPTIONS.find(option => option.value === brandEdits.outputSize)?.label || 'Match uploaded reference',
        sourceReferenceImage: {
          name: activeSourceName,
          role: generatedImage ? 'active-parent-source' : 'source-layout-reference',
          isLatestGeneratedParent: Boolean(generatedImage),
          fieldName: 'sourceReferenceImage',
        },
        childSourceImage: {
          name: generatedImage ? 'Current child source from latest generated parent' : 'Current child source from uploaded reference',
          role: 'current-working-design',
          fieldName: 'childSourceImage',
        },
        essentialsImage: essentialsImage ? {
          name: essentialsImage.name,
          fieldName: 'essentialsImage',
          role: 'user-provided essentials reference',
        } : undefined,
        referenceImages: referenceImages.map(image => ({
          sectionId: image.sectionId,
          sectionName: image.sectionName,
          sectionType: image.sectionType,
          name: image.name,
          fieldName: image.fieldName,
        })),
        sections: breakdown.design?.sections || [],
        layoutLock: {
          instruction: 'Preserve every atom inside its original source region. Only change content for selected atoms; keep all atom positions, scale, hierarchy, and relative spacing locked.',
          atoms: (breakdown.design?.editableComponents || [])
            .filter(atom => !atom.deleted)
            .map(atom => ({
              id: atom.id,
              name: atom.name,
              type: atom.type,
              content: atom.content,
              sectionId: atom.sectionId,
              boundingBox: atom.boundingBox,
              layerIndex: atom.layerIndex,
            })),
        },
        editRound: {
          maxChanges: 3,
          selectedAtomIds: selectedAtoms.map(atom => atom.id),
          essentials: filledEssentials,
          previouslyEditedAtomIds: (breakdown.design?.editableComponents || [])
            .filter(atom => atom.deleted)
            .map(atom => atom.id),
        },
        editableComponents: selectedAtoms
          .map(s => {
            const edit = atomEdits[s.id]
            return {
              ...s,
              replacement: edit?.mode === 'customize'
                ? edit.assetDataUrl
                  ? `${edit.value || `Use uploaded reference image ${edit.assetName || 'for this atom'}`}. This atom has a real uploaded reference image attached in recipe.referenceImages; it must appear in the generated flyer.`
                  : edit.value
                : 'Same as original',
              replacementAsset: edit?.mode === 'customize' && edit.assetDataUrl
                ? { name: edit.assetName, referenceKey: s.id }
                : undefined,
            }
          }),
        styleTokens: {
          palette: {
            primary: brandEdits.primaryColor,
            secondary: brandEdits.secondaryColor,
            accent: brandEdits.accentColor,
          },
          typography: {
            headingFont: brandEdits.headingFont,
            bodyFont: brandEdits.bodyFont,
          },
          visualStyle: brandEdits.visualStyle || breakdown.design?.styleTokens?.visualStyle || 'Same as uploaded design',
          essentials: filledEssentials.join('\n'),
        },
      }

      setGenerationStage('Sending recipe to GPT-Image 2')
      const form = new FormData()
      form.append('recipe', JSON.stringify(recipe))
      form.append('sourceReferenceImage', sourceReferenceBlob, generatedImage ? 'latest-generated-parent.jpg' : (uploadedFile.name || 'reference-flyer.jpg'))
      form.append('childSourceImage', childSourceBlob, 'child-source.jpg')
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
        const normalizedImageSrc = await resizeImageToDimensions(imageSrc, sourceDimensions.width, sourceDimensions.height)
        setGeneratedImage(normalizedImageSrc)
        setGenerationQa(data.qa || null)
        persistCurrentProject({
          id: currentProjectId || undefined,
          name: uploadedFile.name || 'Spyda generated design',
          referencePreview: uploadedPreview,
          generatedImage: normalizedImageSrc,
          breakdown,
          atomEdits,
          brandEdits,
          qa: data.qa || null,
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
      } else if (data?.ok && !data?.image) {
        setGenerateError(data?.message || 'Generation returned no image (mock mode — set OPENAI_API_KEY).')
      } else {
        setGenerateError(data?.error || 'Generation failed.')
      }
    } catch (err: any) {
      const message = String(err?.message || '')
      setGenerateError(
        message === 'Failed to fetch'
          ? 'The generation request could not reach the server. Spyda now compresses generation images automatically; refresh and try again. If it repeats, use fewer large replacement images in that round.'
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
        <SidebarNav className="w-[260px] h-full" activeId={activeId} onSelect={setActiveId} />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="relative z-50 h-14 shrink-0 border-b border-white/[0.06] bg-[#060608]/80 backdrop-blur-xl flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors">
              {sidebarOpen ? <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} /> : <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />}
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">My Workspace</span>
              <span className="text-muted-foreground/30">/</span>
              <span className="font-semibold text-foreground">{activeTitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
              <button onClick={handleReset} className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-xs font-medium text-muted-foreground hover:bg-white/[0.06] transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Reset
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
        <div className="flex-1 overflow-y-auto">
          {activeId === 'canvas' && (
            <CanvasView
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
              onGenerate={handleGenerate}
              onReset={handleReset}
              onAtomEdit={(id, mode, value) => setAtomEdits(prev => ({ ...prev, [id]: { ...prev[id], mode, value } }))}
              onEssentialPromptChange={(index, value) => setEssentialPrompts(prev => prev.map((prompt, promptIndex) => promptIndex === index ? value : prompt))}
              onBrandEdit={(field, value) => setBrandEdits(prev => ({ ...prev, [field]: value }))}
            />
          )}
          {activeId === 'gallery' && <GalleryView />}
          {activeId === 'wallet' && <WalletView />}
          {activeId === 'settings' && <SettingsView profilePic={profilePic} setProfilePic={setProfilePic} />}
          {!['canvas', 'gallery', 'wallet', 'settings'].includes(activeId) && <PlaceholderView title={activeTitle} />}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Canvas View — Full Functional Implementation
   ═══════════════════════════════════════════════ */

function CanvasView({
  uploadedFile, uploadedPreview,
  breakdown, isAnalyzing, isGenerating, generatedImage,
  generationQa, analysisStage, generationStage,
  analyzeError, generateError, atomEdits, brandEdits,
  essentialsImage,
  essentialPrompts,
  onUpload, onAtomImageUpload, onEssentialsImageUpload, onRemoveEssentialsImage, onDeleteAtom, onGenerate, onReset,
  onAtomEdit, onBrandEdit, onEssentialPromptChange
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
  onReset: () => void
  onAtomEdit: (id: string, mode: 'same' | 'customize', value: string) => void
  onBrandEdit: (field: string, value: string) => void
  onEssentialPromptChange: (index: number, value: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const essentialsInputRef = useRef<HTMLInputElement>(null)
  const essentialPromptRefs = useRef<Array<HTMLInputElement | null>>([])
  const [isDragging, setIsDragging] = useState(false)

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
        className={`h-full flex flex-col items-center justify-center p-8 relative transition-colors ${isDragging ? 'bg-primary/[0.04]' : ''}`}
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
  const selectedAtomCount = visibleSections.filter(section => atomEdits[section.id]?.mode === 'customize').length
  const essentialCount = essentialPrompts.filter(prompt => prompt.trim()).length
  const totalChangeCount = selectedAtomCount + essentialCount
  const remainingChangeCount = Math.max(0, 3 - totalChangeCount)
  const canApplyRound = totalChangeCount === 3
  const activeSourcePreview = generatedImage || uploadedPreview
  const activeSourceName = generatedImage ? 'Latest generated parent' : uploadedFile.name

  return (
    <div className="min-h-full flex flex-col lg:flex-row lg:h-full">
      {/* Left: Source + Child Source */}
      <div className="lg:w-[45%] shrink-0 border-r border-white/[0.06] flex flex-col">
        {/* Active Source Image */}
        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary">Source</span>
              <span className="text-[11px] text-muted-foreground/50">{activeSourceName}</span>
            </div>
            <button onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Change</button>
          </div>
          <div className="relative flex h-[340px] items-center justify-center rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
            <img src={activeSourcePreview!} alt="Active parent source flyer" className="h-full w-full object-contain" />
            {isAnalyzing && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                <span className="text-sm font-medium text-primary">Spyda is dissecting...</span>
                <span className="text-xs text-muted-foreground mt-1">{analysisStage || 'Analyzing layout, text, colors, structure'}</span>
              </div>
            )}
          </div>
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
          {generationQa && !generationQa.skipped && (
            <div className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary">Reference Match QA</span>
                {typeof generationQa.score === 'number' && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{generationQa.score}/100</span>
                )}
              </div>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {generationQa.layoutMatch && <span>Layout: {generationQa.layoutMatch}</span>}
                {generationQa.textMatch && <span>Text: {generationQa.textMatch}</span>}
                {generationQa.assetMatch && <span>Assets: {generationQa.assetMatch}</span>}
                {generationQa.sizeMatch && <span>Size: {generationQa.sizeMatch}</span>}
              </div>
              {!!generationQa.issues?.length && (
                <p className="mt-2 text-xs text-muted-foreground">{generationQa.issues.slice(0, 2).join(' ')}</p>
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

      {/* Right: Atom Cards + Brand Card + Generate */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {isAnalyzing ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
              <h3 className="font-heading text-xl font-semibold mb-2">Dissecting design atoms...</h3>
              <p className="text-sm text-muted-foreground">{analysisStage || 'Spyda is mapping every component of your reference'}</p>
            </div>
          </div>
        ) : breakdown ? (
          <div className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-heading text-lg font-semibold">Design Atoms</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {visibleSections.length} component{visibleSections.length !== 1 ? 's' : ''} detected • Edit replacements below
                </p>
              </div>
              <button
                onClick={onGenerate}
                disabled={isGenerating || !canApplyRound}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isGenerating ? 'Applying...' : `Apply ${totalChangeCount}/3`}
              </button>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">3-change round</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedAtomCount} atom change{selectedAtomCount !== 1 ? 's' : ''} + {essentialCount} Essential prompt{essentialCount !== 1 ? 's' : ''}. {remainingChangeCount} slot{remainingChangeCount !== 1 ? 's' : ''} left.
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${canApplyRound ? 'bg-primary/15 text-primary' : 'bg-white/[0.05] text-muted-foreground'}`}>
                  {totalChangeCount}/3 ready
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
                <label className="text-xs text-muted-foreground mb-1 block">Essentials</label>
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
                      className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors disabled:opacity-40"
                    />
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/60">
                  Each filled Essential prompt counts as one of the 3 changes in this round.
                </p>
                <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">Essentials image</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {essentialsImage?.name || 'Upload logo, product, screenshot, mood reference, or exact visual requirement'}
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
                          className="inline-flex h-9 items-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                        >
                          Remove
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => essentialsInputRef.current?.click()}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
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

            {/* Bottom Generate */}
            <div className="pt-4 pb-8">
              <button
                onClick={onGenerate}
                disabled={isGenerating || !canApplyRound}
                className="w-full inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-sm font-bold text-primary-foreground shadow-[0_18px_44px_rgba(157,250,176,0.22)] transition-all hover:shadow-[0_22px_54px_rgba(157,250,176,0.32)] hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {isGenerating ? 'Applying 3 Changes...' : `Apply Round (${totalChangeCount}/3)`}
              </button>
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
      </div>
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
            <div className="absolute right-0 top-9 z-30 w-40 overflow-hidden rounded-xl border border-white/[0.08] bg-[#101312] p-1 shadow-2xl shadow-black/40">
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
              <textarea
                value={edit?.value || ''}
                onChange={e => onEdit(section.id, 'customize', e.target.value)}
                placeholder={`${replacementHint}. Example: place this logo at the top right and keep it sharp.`}
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

function GalleryView() {
  const [projects, setProjects] = useState<SavedSpydaProject[]>([])

  useEffect(() => {
    setProjects(loadSavedProjects())
  }, [])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-heading text-2xl font-bold">Gallery</h2>
          <p className="text-sm text-muted-foreground mt-1">Your saved references, breakdowns, and generated designs</p>
        </div>
        <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 text-sm font-medium text-primary hover:bg-primary/15 transition-colors">
          <Sparkles className="w-4 h-4" /> New Design
        </button>
      </div>
      {projects.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {projects.map(project => (
            <div key={project.id} className="group rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.025] transition-all hover:border-primary/30 hover:shadow-xl">
              <div className="relative aspect-[4/5] bg-black/30">
                {project.generatedImage || project.referencePreview ? (
                  <img
                    src={project.generatedImage || project.referencePreview || ''}
                    alt={project.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Image className="h-10 w-10 text-muted-foreground/30" />
                  </div>
                )}
                <div className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur">
                  {project.generatedImage ? 'Generated' : 'Draft'}
                </div>
                {typeof project.qa?.score === 'number' && (
                  <div className="absolute right-3 top-3 rounded-full bg-primary/90 px-3 py-1 text-xs font-bold text-primary-foreground">
                    {project.qa.score}/100
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="line-clamp-1 font-heading text-base font-semibold">{project.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {project.breakdown?.design?.editableComponents?.filter(atom => !atom.deleted).length || 0} design atoms saved
                </p>
                <p className="mt-3 text-[11px] text-muted-foreground/60">
                  Updated {new Date(project.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-12 text-center">
          <Sparkles className="mx-auto mb-4 h-9 w-9 text-primary/50" />
          <h3 className="font-heading text-lg font-semibold">No saved designs yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Analyze or generate a flyer and Spyda will save it here automatically.</p>
        </div>
      )}
    </div>
  )
}

function WalletView() {
  const { user } = useAuth()
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)

  // Fetch balance on load
  useEffect(() => {
    async function fetchBalance() {
      if (!user) return
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('wallet_balance')
          .eq('id', user.id)
          .single()
        
        if (data && data.wallet_balance) {
          setBalance(data.wallet_balance)
        }
      } catch (err) {
        console.error('Error fetching balance:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchBalance()
  }, [user])

  // Exchange rate: 1 USD = 1500 NGN (mock)
  const USD_TO_NGN = 1500

  // Paystack configuration logic
  const handleTopUp = (amountUSD: number, creditsToAdd: number) => {
    if (!user) return alert("Please log in to add credits.")
    
    // Amount in Kobo (NGN * 100)
    const amountInKobo = amountUSD * USD_TO_NGN * 100

    const config = {
      reference: (new Date()).getTime().toString(),
      email: user.email || 'user@spyda.ai',
      amount: amountInKobo, 
      publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
      currency: 'NGN'
    }

    const onSuccess = async (reference: any) => {
      // Payment complete! Update Supabase
      const newBalance = balance + creditsToAdd
      setBalance(newBalance)

      try {
        await supabase
          .from('profiles')
          .update({ wallet_balance: newBalance })
          .eq('id', user.id)
        
        alert(`Success! Transaction Ref: ${reference.reference}. Added ${creditsToAdd} credits!`)
      } catch (e) {
        console.error('Error updating balance in DB:', e)
        alert('Payment succeeded but failed to update database. Please contact support.')
      }
    }

    const onClose = () => {
      console.log('Payment modal closed.')
    }

    // Since we can't use hooks dynamically inside the click handler, 
    // we use the Paystack Pop initialization directly or a wrapper component.
    // However, react-paystack provides usePaystackPayment hook which we can initialize at the top level.
    // To support dynamic amounts with the hook, we can set the config in state, but it's easier to just use the hook in a child component or use the initializePayment function.
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="font-heading text-2xl font-bold mb-2">Wallet</h2>
      <p className="text-sm text-muted-foreground mb-8">Manage your Spyda credits and billing</p>
      <div className="relative overflow-hidden rounded-2xl p-8 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#22c55e]/20 via-[#16a34a]/10 to-[#8bd3ff]/10 border border-primary/20 rounded-2xl" />
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative z-10">
          <p className="text-sm text-primary/70 font-semibold mb-2">AVAILABLE BALANCE</p>
          <div className="font-heading text-5xl font-bold text-foreground mb-1">
            {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : balance} 
            <span className="text-xl text-muted-foreground font-normal ml-2">Credits</span>
          </div>
          <p className="text-sm text-muted-foreground">≈ {Math.floor(balance / 12)} generations remaining</p>
        </div>
      </div>
      <h3 className="font-heading font-semibold text-lg mb-4">Quick Top-Up</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { amountUSD: 5, credits: 500, label: "$5" },
          { amountUSD: 10, credits: 1000, label: "$10" },
          { amountUSD: 25, credits: 2800, label: "$25" },
        ].map((tier) => (
          <PaystackTopUpButton 
            key={tier.amountUSD} 
            tier={tier} 
            user={user} 
            balance={balance}
            setBalance={setBalance}
            usdToNgn={USD_TO_NGN}
          />
        ))}
      </div>
    </div>
  )
}

// Subcomponent to handle the usePaystackPayment hook dynamically per tier
function PaystackTopUpButton({ tier, user, balance, setBalance, usdToNgn }: any) {
  const config = {
    reference: (new Date()).getTime().toString() + tier.amountUSD,
    email: user?.email || 'user@spyda.ai',
    amount: tier.amountUSD * usdToNgn * 100, // NGN to Kobo
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
    currency: 'NGN'
  }

  const initializePayment = usePaystackPayment(config)

  const handleSuccess = async (reference: any) => {
    const newBalance = balance + tier.credits
    setBalance(newBalance)

    if (user) {
      await supabase
        .from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', user.id)
    }
  }

  const handleClose = () => {
    // Modal closed
  }

  return (
    <button
      onClick={() => {
        if (!user) {
          alert("Please log in to add credits.")
          return
        }
        initializePayment({ onSuccess: handleSuccess, onClose: handleClose })
      }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition-all hover:border-primary/30 hover:bg-primary/[0.03] cursor-pointer"
    >
      <div className="font-heading text-2xl font-bold text-foreground">{tier.label}</div>
      <div className="text-sm text-muted-foreground mt-1">{tier.credits.toLocaleString()} Credits</div>
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

