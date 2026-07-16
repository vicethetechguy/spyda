import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Clock3,
  Copy,
  FileImage,
  FolderKanban,
  LayoutTemplate,
  Loader2,
  Palette,
  Plus,
  Search,
  Trash2,
  Type,
  Upload,
} from 'lucide-react'
import type { LegacyBreakdown as BreakdownResult } from '../../core/design-document'
import type { AtomBox } from '../../lib/design'

export type WorkspaceAtomEdit = {
  mode: 'same' | 'customize'
  value: string
  assetName?: string
  assetDataUrl?: string
  box?: AtomBox
}

export type WorkspaceBrandEdits = {
  headingFont: string
  bodyFont: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  visualStyle: string
  essentials: string
  outputSize: string
  applyBrandConstants?: boolean
}

export type WorkspaceProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  archived?: boolean
  referencePreview?: string | null
  qaParentPreview?: string | null
  generatedImage?: string | null
  breakdown?: BreakdownResult | null
  atomEdits?: Record<string, WorkspaceAtomEdit>
  brandEdits?: WorkspaceBrandEdits
  qa?: {
    passed?: boolean
    score?: number
  } | null
}

export type BrandAsset = {
  id: string
  kind: 'image' | 'color' | 'font'
  name: string
  value: string
  createdAt: string
}

const SAVED_PROJECTS_KEY = 'spyda.savedProjects.v1'
const BRAND_ASSETS_KEY = 'spyda.brandAssets.v1'
const PROJECTS_EVENT = 'spyda-projects-updated'

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

function writeProjects(projects: WorkspaceProject[]) {
  window.localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(projects))
  window.dispatchEvent(new CustomEvent(PROJECTS_EVENT))
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(date)
}

function useSavedProjects() {
  const [projects, setProjects] = useState<WorkspaceProject[]>(() => readJson(SAVED_PROJECTS_KEY, []))
  const refresh = useCallback(() => setProjects(readJson(SAVED_PROJECTS_KEY, [])), [])

  useEffect(() => {
    window.addEventListener('storage', refresh)
    window.addEventListener(PROJECTS_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(PROJECTS_EVENT, refresh)
    }
  }, [refresh])

  return { projects, refresh }
}

function PageIntro({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy}</p>
      </div>
      {action}
    </div>
  )
}

function EmptyLibrary({ icon: Icon, title, copy, action }: { icon: React.ElementType; title: string; copy: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center border border-dashed border-white/[0.1] bg-white/[0.015] p-8 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="font-heading text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function ProjectPreview({ project }: { project: WorkspaceProject }) {
  const source = project.generatedImage || project.referencePreview
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-[#0a0a0c]">
      {source ? <img src={source} alt="" className="h-full w-full object-contain" /> : (
        <div className="flex h-full items-center justify-center"><FileImage className="h-7 w-7 text-muted-foreground/30" /></div>
      )}
      <span className={`absolute left-3 top-3 rounded px-2 py-1 text-[9px] font-semibold uppercase ${project.generatedImage ? 'bg-primary text-primary-foreground' : 'bg-black/70 text-white'}`}>
        {project.generatedImage ? 'Generated' : project.breakdown ? 'Analyzed' : 'Uploaded'}
      </span>
    </div>
  )
}

export function HistoryView({ onOpenProject, onNewDesign }: { onOpenProject: (project: WorkspaceProject) => void; onNewDesign: () => void }) {
  const { projects } = useSavedProjects()
  const [pendingDelete, setPendingDelete] = useState<string | 'all' | null>(null)
  const sorted = useMemo(() => [...projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [projects])

  const remove = (id: string) => {
    writeProjects(projects.filter(project => project.id !== id))
    setPendingDelete(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <PageIntro
        eyebrow="Workspace activity"
        title="History"
        copy="Every reference you analyze and every child design you create is kept here until you remove it."
        action={projects.length ? (
          <button type="button" onClick={() => setPendingDelete('all')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 text-xs font-semibold text-red-300 hover:bg-red-500/[0.1]">
            <Trash2 className="h-4 w-4" /> Clear history
          </button>
        ) : undefined}
      />

      {pendingDelete && (
        <div className="mt-5 flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-red-100">{pendingDelete === 'all' ? 'Delete every saved project and preview from this browser?' : 'Delete this project and its saved previews?'}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPendingDelete(null)} className="h-9 rounded-lg border border-white/[0.1] px-4 text-xs font-semibold">Cancel</button>
            <button type="button" onClick={() => pendingDelete === 'all' ? (writeProjects([]), setPendingDelete(null)) : remove(pendingDelete)} className="h-9 rounded-lg bg-red-500 px-4 text-xs font-semibold text-white">Delete</button>
          </div>
        </div>
      )}

      <div className="mt-6">
        {!sorted.length ? (
          <EmptyLibrary icon={Clock3} title="Your history is clear" copy="Upload a reference to start a design. Spyda will keep the working project here." action={<button type="button" onClick={onNewDesign} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Start a design</button>} />
        ) : (
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {sorted.map(project => (
              <div key={project.id} className="grid gap-4 py-4 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:items-center">
                <div className="h-20 overflow-hidden rounded-lg border border-white/[0.08]"><ProjectPreview project={project} /></div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Updated {formatDate(project.updatedAt)}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{project.breakdown?.design?.editableComponents?.length || 0} design atoms {project.archived ? ' · Archived' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onOpenProject(project)} className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Open</button>
                  <button type="button" onClick={() => setPendingDelete(project.id)} aria-label={`Delete ${project.name}`} title="Delete" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-muted-foreground hover:border-red-500/30 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ProjectsView({ initialFilter, onOpenProject, onNewDesign }: { initialFilter: 'active' | 'archived'; onOpenProject: (project: WorkspaceProject) => void; onNewDesign: () => void }) {
  const { projects } = useSavedProjects()
  const [filter, setFilter] = useState<'active' | 'archived'>(initialFilter)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  useEffect(() => setFilter(initialFilter), [initialFilter])

  const visible = useMemo(() => projects
    .filter(project => filter === 'archived' ? project.archived : !project.archived)
    .filter(project => project.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [filter, projects, search])

  const updateProject = (id: string, updates: Partial<WorkspaceProject>) => writeProjects(projects.map(project => project.id === id ? { ...project, ...updates, updatedAt: new Date().toISOString() } : project))
  const removeProject = (id: string) => {
    writeProjects(projects.filter(project => project.id !== id))
    setPendingDelete(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <PageIntro eyebrow="Organize your work" title="Projects" copy="Resume active designs or move finished work into your archive." action={<button type="button" onClick={onNewDesign} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> New project</button>} />
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
          {(['active', 'archived'] as const).map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`h-8 rounded-md px-4 text-xs font-semibold capitalize ${filter === value ? 'bg-white/[0.1] text-foreground' : 'text-muted-foreground'}`}>{value}</button>)}
        </div>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 sm:w-72">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
        </label>
      </div>

      {!visible.length ? (
        <div className="mt-6"><EmptyLibrary icon={FolderKanban} title={search ? 'No matching projects' : `No ${filter} projects`} copy={filter === 'archived' ? 'Archive a finished project to keep your active workspace tidy.' : 'Upload a flyer or begin with a template to create your first project.'} /></div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(project => (
            <article key={project.id} className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
              <ProjectPreview project={project} />
              <div className="p-4">
                <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">Updated {formatDate(project.updatedAt)}</p>
                <div className="mt-4 flex items-center gap-2">
                  <button type="button" onClick={() => onOpenProject(project)} className="h-9 flex-1 rounded-lg bg-primary text-xs font-semibold text-primary-foreground">Open</button>
                  <button type="button" onClick={() => updateProject(project.id, { archived: !project.archived })} title={project.archived ? 'Restore project' : 'Archive project'} aria-label={project.archived ? 'Restore project' : 'Archive project'} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-muted-foreground hover:text-foreground">{project.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</button>
                  <button type="button" onClick={() => setPendingDelete(project.id)} title="Delete project" aria-label="Delete project" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-muted-foreground hover:border-red-500/30 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
                {pendingDelete === project.id && <div className="mt-3 flex items-center justify-between gap-3 border-t border-red-500/20 pt-3"><span className="text-[11px] text-red-200">Delete permanently?</span><div className="flex gap-2"><button type="button" onClick={() => setPendingDelete(null)} className="text-[11px] text-muted-foreground">Cancel</button><button type="button" onClick={() => removeProject(project.id)} className="text-[11px] font-semibold text-red-300">Delete</button></div></div>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

const TEMPLATE_LIBRARY = [
  ['Product launch', 'Technology', '/assets/spyda-sample-03.jpeg'],
  ['Fintech campaign', 'Finance', '/assets/spyda-sample-04.jpeg'],
  ['Promotional offer', 'Marketing', '/assets/spyda-sample-05.jpeg'],
  ['App launch', 'Technology', '/assets/spyda-sample-06.jpeg'],
  ['Payments campaign', 'Finance', '/assets/spyda-sample-07.jpeg'],
  ['Subscription offer', 'Marketing', '/assets/spyda-sample-08.jpeg'],
  ['Mobile product', 'Technology', '/assets/spyda-sample-09.jpeg'],
  ['Brand introduction', 'Business', '/assets/spyda-sample-10.jpeg'],
  ['Waitlist campaign', 'Marketing', '/assets/spyda-sample-11.jpeg'],
  ['Digital services', 'Business', '/assets/spyda-sample-12.jpeg'],
] as const

export function TemplatesView({ onUseTemplate }: { onUseTemplate: (source: string, name: string) => Promise<void> }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [loading, setLoading] = useState<string | null>(null)
  const categories = ['All', ...Array.from(new Set(TEMPLATE_LIBRARY.map(template => template[1])))]
  const templates = TEMPLATE_LIBRARY.filter(template => (category === 'All' || template[1] === category) && template[0].toLowerCase().includes(search.toLowerCase()))

  const applyTemplate = async (source: string, name: string) => {
    setLoading(source)
    try { await onUseTemplate(source, name) } finally { setLoading(null) }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <PageIntro eyebrow="Reference library" title="Templates" copy="Start from a polished flyer reference, then let Spyda dissect it into editable design atoms." />
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map(value => <button key={value} type="button" onClick={() => setCategory(value)} className={`h-9 shrink-0 rounded-lg border px-4 text-xs font-semibold ${category === value ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/[0.08] text-muted-foreground'}`}>{value}</button>)}
        </div>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 sm:w-64"><Search className="h-4 w-4 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search templates" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {templates.map(([name, type, source]) => (
          <article key={source} className="group overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
            <div className="relative aspect-[4/5] overflow-hidden bg-[#0a0a0c]"><img src={source} alt={`${name} template`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /></div>
            <div className="p-3"><p className="truncate text-sm font-semibold">{name}</p><p className="mt-1 text-[10px] uppercase text-muted-foreground">{type}</p><button type="button" disabled={loading !== null} onClick={() => applyTemplate(source, `${name}.jpeg`)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50">{loading === source ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutTemplate className="h-4 w-4" />} Use template</button></div>
          </article>
        ))}
      </div>
    </div>
  )
}

async function imageAssetDataUrl(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.')
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new window.Image()
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) return reject(new Error('Could not prepare this image.'))
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86))
      }
      image.onerror = () => reject(new Error('Could not read this image.'))
      image.src = String(reader.result)
    }
    reader.onerror = () => reject(new Error('Could not read this image.'))
    reader.readAsDataURL(file)
  })
}

export function BrandAssetsView({ onUseAsset }: { onUseAsset: (asset: BrandAsset) => void }) {
  const [assets, setAssets] = useState<BrandAsset[]>(() => readJson(BRAND_ASSETS_KEY, []))
  const [color, setColor] = useState('#22C55E')
  const [colorName, setColorName] = useState('Primary green')
  const [fontName, setFontName] = useState('Space Grotesk')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const saveAssets = (next: BrandAsset[]) => {
    setAssets(next)
    window.localStorage.setItem(BRAND_ASSETS_KEY, JSON.stringify(next))
  }
  const add = (asset: Omit<BrandAsset, 'id' | 'createdAt'>) => saveAssets([{ ...asset, id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `asset-${Date.now()}`, createdAt: new Date().toISOString() }, ...assets])
  const addColor = () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return setError('Enter a six-digit HEX color, such as #22C55E.')
    add({ kind: 'color', name: colorName.trim() || color.toUpperCase(), value: color.toUpperCase() }); setError('')
  }
  const addFont = () => {
    if (!fontName.trim()) return setError('Enter a font name first.')
    add({ kind: 'font', name: fontName.trim(), value: fontName.trim() }); setError('')
  }
  const uploadImage = async (file?: File) => {
    if (!file) return
    try { add({ kind: 'image', name: file.name.replace(/\.[^.]+$/, ''), value: await imageAssetDataUrl(file) }); setError('') } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this asset.') }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <PageIntro eyebrow="Reusable identity" title="Brand Assets" copy="Keep logos, brand colors, and type choices ready to apply to any Spyda design." action={<><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={event => uploadImage(event.target.files?.[0])} /><button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"><Upload className="h-4 w-4" /> Upload logo or image</button></>} />
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4"><div className="flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Add brand color</h3></div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]"><input value={colorName} onChange={event => setColorName(event.target.value)} aria-label="Color name" placeholder="Color name" className="h-10 rounded-lg border border-white/[0.08] bg-background px-3 text-sm outline-none focus:border-primary/50" /><label className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-background px-2"><input type="color" value={color} onChange={event => setColor(event.target.value.toUpperCase())} className="h-6 w-6 cursor-pointer border-0 bg-transparent" /><input value={color} onChange={event => setColor(event.target.value.toUpperCase())} aria-label="HEX color" className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none" /></label><button type="button" onClick={addColor} className="h-10 rounded-lg border border-primary/30 px-4 text-xs font-semibold text-primary">Add</button></div></div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4"><div className="flex items-center gap-2"><Type className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Add brand font</h3></div><div className="mt-4 flex gap-2"><input value={fontName} onChange={event => setFontName(event.target.value)} aria-label="Font name" placeholder="Font name" className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-background px-3 text-sm outline-none focus:border-primary/50" /><button type="button" onClick={addFont} className="h-10 rounded-lg border border-primary/30 px-4 text-xs font-semibold text-primary">Add</button></div></div>
      </div>
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      {!assets.length ? <div className="mt-6"><EmptyLibrary icon={Palette} title="Build your brand kit" copy="Upload a logo, save your HEX colors, and add the fonts you use most often." /></div> : (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {assets.map(asset => (
            <article key={asset.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-white/[0.06] bg-black/20">
                {asset.kind === 'image' && <img src={asset.value} alt={asset.name} className="h-full w-full object-contain p-3" />}
                {asset.kind === 'color' && <div className="h-16 w-16 rounded-full border border-white/20" style={{ backgroundColor: asset.value }} />}
                {asset.kind === 'font' && <span className="text-4xl" style={{ fontFamily: asset.value }}>Aa</span>}
              </div>
              <div className="mt-3 flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{asset.name}</p><p className="mt-1 truncate text-[10px] uppercase text-muted-foreground">{asset.kind === 'color' ? asset.value : asset.kind}</p></div><button type="button" onClick={() => saveAssets(assets.filter(item => item.id !== asset.id))} title="Delete asset" aria-label="Delete asset" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button></div>
              <button type="button" onClick={() => onUseAsset(asset)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-primary/30 text-xs font-semibold text-primary"><Copy className="h-3.5 w-3.5" /> Apply to canvas</button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
