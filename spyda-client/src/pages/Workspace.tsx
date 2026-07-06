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
  ChevronRight
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

type AtomSection = {
  id: string
  name: string
  type: string
  current: {
    text?: string
    image?: string
    description?: string
  }
  replacementNeeded: string[]
  deleted?: boolean
}

type BreakdownConstants = {
  headingFont?: string
  bodyFont?: string
  colors?: { primary?: string; secondary?: string; accent?: string }
  visualStyle?: string
}

type BreakdownResult = {
  sections: AtomSection[]
  constants: BreakdownConstants
  notes?: string
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
  message?: string
  error?: string
}

/* ═══════════════════════════════════════════════
   Main Workspace
   ═══════════════════════════════════════════════ */

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
  const [subjectFile, setSubjectFile] = useState<File | null>(null)
  const [subjectPreview, setSubjectPreview] = useState<string | null>(null)
  const [breakdown, setBreakdown] = useState<BreakdownResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Atom edits — keyed by section id
  const [atomEdits, setAtomEdits] = useState<Record<string, { mode: 'same' | 'customize'; value: string }>>({})

  // Brand card state
  const [brandEdits, setBrandEdits] = useState<{
    headingFont: string
    bodyFont: string
    primaryColor: string
    secondaryColor: string
    accentColor: string
    visualStyle: string
    essentials: string
  }>({
    headingFont: 'Space Grotesk',
    bodyFont: 'Montserrat',
    primaryColor: '#0F172A',
    secondaryColor: '#22C55E',
    accentColor: '#F8FAFC',
    visualStyle: '',
    essentials: '',
  })

  // Populate brand edits from breakdown
  useEffect(() => {
    if (breakdown?.constants) {
      const c = breakdown.constants
      setBrandEdits(prev => ({
        headingFont: c.headingFont || prev.headingFont,
        bodyFont: c.bodyFont || prev.bodyFont,
        primaryColor: normalizeHexColor(c.colors?.primary || '', prev.primaryColor),
        secondaryColor: normalizeHexColor(c.colors?.secondary || '', prev.secondaryColor),
        accentColor: normalizeHexColor(c.colors?.accent || '', prev.accentColor),
        visualStyle: c.visualStyle || prev.visualStyle,
        essentials: prev.essentials,
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

  const handleDesignUpload = useCallback(async (file: File) => {
    setUploadedFile(file)
    setUploadedPreview(URL.createObjectURL(file))
    setBreakdown(null)
    setGeneratedImage(null)
    setAnalyzeError(null)
    setGenerateError(null)
    setAtomEdits({})

    // Helper to compress image on client-side to bypass Vercel 4.5MB payload limit
    const compressImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new window.Image();
          img.src = event.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1024;
            const MAX_HEIGHT = 1024;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            
            // Compress to JPEG with 0.8 quality
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve(dataUrl);
          };
          img.onerror = (error: any) => reject(error);
        };
        reader.onerror = (error: any) => reject(error);
      });
    };

    // Auto-analyze
    setIsAnalyzing(true)
      try {
        const base64Image = await compressImage(file);
        
        const res = await fetch('/api/analyze', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image, aiProvider: aiModel.provider })
        })
        const data = await readApiJson<ApiAnalyzeResponse>(res)
        
        if (data?.ok && data?.breakdown) {
          setBreakdown(data.breakdown)
        } else {
          setAnalyzeError(data?.error || 'Analysis failed. Check your API keys.')
        }
      } catch (err: any) {
        setAnalyzeError(err.message || 'Failed to connect to server.')
      } finally {
        setIsAnalyzing(false)
      }
  }, [aiModel])

  /* ── Generate handler ── */
  const handleGenerate = useCallback(async () => {
    if (!uploadedFile || !breakdown) return
    setIsGenerating(true)
    setGenerateError(null)

    try {
      // Build recipe from atoms + brand card
      const recipe: Record<string, any> = {
        aiProvider: aiModel.provider,
        sections: breakdown.sections
          .filter(s => !s.deleted)
          .map(s => {
            const edit = atomEdits[s.id]
            return {
              ...s,
              replacement: edit?.mode === 'customize' ? edit.value : 'Same as original',
            }
          }),
        constants: {
          headingFont: brandEdits.headingFont,
          bodyFont: brandEdits.bodyFont,
          colors: {
            primary: brandEdits.primaryColor,
            secondary: brandEdits.secondaryColor,
            accent: brandEdits.accentColor,
          },
          visualStyle: brandEdits.visualStyle || breakdown.constants.visualStyle || 'Same as uploaded design',
          essentials: brandEdits.essentials,
        },
      }

      const res = await fetch('/api/generate', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe }) 
      })
      const data = await readApiJson<ApiGenerateResponse>(res)

      if (data?.ok && data?.image) {
        if (data.image.startsWith('http')) {
          setGeneratedImage(data.image)
        } else {
          setGeneratedImage(`data:image/png;base64,${data.image}`)
        }
      } else if (data?.ok && !data?.image) {
        setGenerateError(data?.message || 'Generation returned no image (mock mode — set OPENAI_API_KEY).')
      } else {
        setGenerateError(data?.error || 'Generation failed.')
      }
    } catch (err: any) {
      setGenerateError(err.message || 'Failed to connect to server.')
    } finally {
      setIsGenerating(false)
    }
  }, [uploadedFile, subjectFile, breakdown, atomEdits, brandEdits, aiModel])

  /* ── Reset handler ── */
  const handleReset = useCallback(() => {
    setUploadedFile(null)
    setUploadedPreview(null)
    setSubjectFile(null)
    setSubjectPreview(null)
    setBreakdown(null)
    setGeneratedImage(null)
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
              subjectFile={subjectFile}
              subjectPreview={subjectPreview}
              breakdown={breakdown}
              isAnalyzing={isAnalyzing}
              isGenerating={isGenerating}
              generatedImage={generatedImage}
              analyzeError={analyzeError}
              generateError={generateError}
              atomEdits={atomEdits}
              brandEdits={brandEdits}
              onUpload={handleDesignUpload}
              onSubjectUpload={(f) => { setSubjectFile(f); setSubjectPreview(URL.createObjectURL(f)) }}
              onGenerate={handleGenerate}
              onReset={handleReset}
              onAtomEdit={(id, mode, value) => setAtomEdits(prev => ({ ...prev, [id]: { mode, value } }))}
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
  uploadedFile, uploadedPreview, subjectFile, subjectPreview,
  breakdown, isAnalyzing, isGenerating, generatedImage,
  analyzeError, generateError, atomEdits, brandEdits,
  onUpload, onSubjectUpload, onGenerate, onReset,
  onAtomEdit, onBrandEdit
}: {
  uploadedFile: File | null
  uploadedPreview: string | null
  subjectFile: File | null
  subjectPreview: string | null
  breakdown: BreakdownResult | null
  isAnalyzing: boolean
  isGenerating: boolean
  generatedImage: string | null
  analyzeError: string | null
  generateError: string | null
  atomEdits: Record<string, { mode: 'same' | 'customize'; value: string }>
  brandEdits: {
    headingFont: string
    bodyFont: string
    primaryColor: string
    secondaryColor: string
    accentColor: string
    visualStyle: string
    essentials: string
  }
  onUpload: (file: File) => void
  onSubjectUpload: (file: File) => void
  onGenerate: () => void
  onReset: () => void
  onAtomEdit: (id: string, mode: 'same' | 'customize', value: string) => void
  onBrandEdit: (field: string, value: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const subjectInputRef = useRef<HTMLInputElement>(null)
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
  const visibleSections = breakdown?.sections.filter(s => !s.deleted) || []

  return (
    <div className="min-h-full flex flex-col lg:flex-row lg:h-full">
      {/* Left: Reference + Generated */}
      <div className="lg:w-[45%] shrink-0 border-r border-white/[0.06] flex flex-col">
        {/* Reference Image */}
        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary">Reference</span>
              <span className="text-[11px] text-muted-foreground/50">{uploadedFile.name}</span>
            </div>
            <button onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Change</button>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
            <img src={uploadedPreview!} alt="Reference" className="w-full object-contain max-h-[300px]" />
            {isAnalyzing && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                <span className="text-sm font-medium text-primary">Spyda is dissecting...</span>
                <span className="text-xs text-muted-foreground mt-1">Analyzing layout, text, colors, structure</span>
              </div>
            )}
          </div>
          {analyzeError && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {analyzeError}
            </div>
          )}
        </div>

        {/* Generated Output */}
        <div className="flex-1 p-6 flex flex-col">
          <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary mb-4">Generated Output</span>
          {generatedImage ? (
            <div className="relative rounded-xl overflow-hidden border border-primary/20 bg-white/[0.02] flex-1 flex items-center justify-center">
              <img src={generatedImage} alt="Generated" className="w-full object-contain max-h-[400px]" />
              <a
                href={generatedImage}
                download={`spyda-output-${Date.now()}.png`}
                className="absolute bottom-4 right-4 inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-4 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 transition-all"
              >
                <Download className="w-4 h-4" /> Download 4K
              </a>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] flex-1 flex flex-col items-center justify-center min-h-[200px]">
              {isGenerating ? (
                <>
                  <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                  <span className="text-sm font-medium text-primary">Generating design...</span>
                  <span className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</span>
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

      {/* Right: Atom Cards + Brand Card + Generate */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {isAnalyzing ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
              <h3 className="font-heading text-xl font-semibold mb-2">Dissecting design atoms...</h3>
              <p className="text-sm text-muted-foreground">Spyda is mapping every component of your reference</p>
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
                disabled={isGenerating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isGenerating ? 'Generating...' : 'Generate Flyer'}
              </button>
            </div>

            {/* Atom Cards */}
            {visibleSections.map((section, i) => (
              <AtomCard
                key={section.id}
                section={section}
                index={i}
                edit={atomEdits[section.id]}
                onEdit={onAtomEdit}
                subjectFile={subjectFile}
                subjectPreview={subjectPreview}
                onSubjectUpload={onSubjectUpload}
                subjectInputRef={subjectInputRef}
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
                <textarea
                  value={brandEdits.essentials}
                  onChange={e => onBrandEdit('essentials', e.target.value)}
                  placeholder="Add anything Spyda missed or must include: logo placement, footer text, offer details, disclaimer, exact image direction, CTA, icons, layout rules..."
                  className="w-full h-24 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors resize-none"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/60">
                  These notes are treated as hard requirements when generating the new flyer.
                </p>
              </div>
            </div>

            {/* Bottom Generate */}
            <div className="pt-4 pb-8">
              <button
                onClick={onGenerate}
                disabled={isGenerating}
                className="w-full inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-sm font-bold text-primary-foreground shadow-[0_18px_44px_rgba(157,250,176,0.22)] transition-all hover:shadow-[0_22px_54px_rgba(157,250,176,0.32)] hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {isGenerating ? 'Generating New Flyer...' : 'Generate New Flyer'}
              </button>
            </div>
            <input ref={subjectInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onSubjectUpload(f) }} />
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
  section, index, edit, onEdit, subjectFile, subjectPreview, onSubjectUpload, subjectInputRef
}: {
  section: AtomSection
  index: number
  edit?: { mode: 'same' | 'customize'; value: string }
  onEdit: (id: string, mode: 'same' | 'customize', value: string) => void
  subjectFile: File | null
  subjectPreview: string | null
  onSubjectUpload: (f: File) => void
  subjectInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const mode = edit?.mode || 'same'
  const isImage = section.type === 'image' || /image|photo|subject|product|logo/i.test(`${section.id} ${section.name}`)
  const replacementHint = section.replacementNeeded?.[0] || `Replacement for ${section.name}`

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
        <span className="text-[10px] font-mono text-muted-foreground/40">{String(index + 1).padStart(2, '0')}</span>
      </div>

      {section.current.description && (
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{section.current.description}</p>
      )}
      {section.current.text && (
        <p className="text-xs text-muted-foreground/70 mb-3 italic">"{section.current.text}"</p>
      )}

      {/* Same / Customize toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => onEdit(section.id, 'same', edit?.value || '')}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition-colors ${mode === 'same' ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06] hover:bg-white/[0.06]'}`}
        >
          {mode === 'same' && <Check className="w-3 h-3" />} Same
        </button>
        <button
          onClick={() => onEdit(section.id, 'customize', edit?.value || '')}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition-colors ${mode === 'customize' ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06] hover:bg-white/[0.06]'}`}
        >
          Customize
        </button>
      </div>

      {/* Customize field */}
      {mode === 'customize' && (
        <div className="animate-fade-in">
          {isImage ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => subjectInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> {subjectFile ? 'Replace' : 'Upload'} Subject
              </button>
              {subjectPreview && (
                <img src={subjectPreview} alt="Subject" className="w-9 h-9 rounded-lg object-cover border border-white/[0.1]" />
              )}
              <span className="text-xs text-muted-foreground">{subjectFile?.name || 'No subject selected'}</span>
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
  const samples = [
    "spyda-sample-01.jpeg", "spyda-sample-02.jpeg", "spyda-sample-03.jpeg",
    "spyda-sample-04.jpeg", "spyda-sample-05.jpeg", "spyda-sample-06.jpeg",
  ]
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-heading text-2xl font-bold">Gallery</h2>
          <p className="text-sm text-muted-foreground mt-1">Your generated designs</p>
        </div>
        <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 text-sm font-medium text-primary hover:bg-primary/15 transition-colors">
          <Sparkles className="w-4 h-4" /> New Design
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {samples.map((src, i) => (
          <div key={i} className="group relative aspect-[4/5] rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] cursor-pointer transition-all hover:border-primary/30 hover:shadow-xl">
            <img src={`/assets/${src}`} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">View Design</span>
              </div>
            </div>
          </div>
        ))}
      </div>
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
