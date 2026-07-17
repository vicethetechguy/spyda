import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Clock3,
  Copy,
  FileImage,
  FolderKanban,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Palette,
  Plus,
  Search,
  Sparkles,
  Store,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react'
import type { LegacyBreakdown as BreakdownResult } from '../../core/design-document'
import type { AtomBox } from '../../lib/design'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  TEMPLATE_LISTING_FEE,
  deleteTemplate,
  fetchMarketplaceTemplates,
  fetchMyPurchases,
  fetchTemplateCategories,
  listTemplate,
  purchaseTemplate,
  uploadTemplateImage,
  type MarketplaceTemplate,
} from '../../lib/marketplace'

export type WorkspaceAtomEdit = {
  mode: 'same' | 'customize' | 'delete'
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

function SpydaCreditMark({ className = '' }: { className?: string }) {
  return <img src="/assets/spyda-credit.png" alt="" aria-hidden="true" className={`shrink-0 object-contain ${className}`} />
}

type DisplayTemplate = {
  key: string
  name: string
  category: string
  source: string
  price: number
  kind: 'spyda' | 'community'
  isOwner?: boolean
  owned?: boolean
  template?: MarketplaceTemplate
}

export function TemplatesView({ onUseTemplate }: { onUseTemplate: (source: string, name: string) => Promise<void> }) {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [applying, setApplying] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [showList, setShowList] = useState(false)

  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([])
  const [dbCategories, setDbCategories] = useState<string[]>([])
  const [purchased, setPurchased] = useState<Set<string>>(new Set())
  const [loadingMarket, setLoadingMarket] = useState(true)
  const [marketError, setMarketError] = useState('')

  const refresh = useCallback(async () => {
    setLoadingMarket(true)
    setMarketError('')
    try {
      const [cats, tpls] = await Promise.all([fetchTemplateCategories(), fetchMarketplaceTemplates()])
      setDbCategories(cats)
      setTemplates(tpls)
      if (user?.id) {
        try { setPurchased(await fetchMyPurchases(user.id)) } catch { /* purchases are best-effort */ }
      }
    } catch {
      setMarketError('Community templates could not be loaded right now. Spyda picks are still available below.')
      setTemplates([])
    } finally {
      setLoadingMarket(false)
    }
  }, [user?.id])

  useEffect(() => { void refresh() }, [refresh])

  const builtIns: DisplayTemplate[] = useMemo(
    () => TEMPLATE_LIBRARY.map(([name, type, source]) => ({ key: `spyda:${source}`, name, category: type, source, price: 0, kind: 'spyda' })),
    [],
  )

  const community: DisplayTemplate[] = useMemo(
    () => templates.map(template => ({
      key: `db:${template.id}`,
      name: template.name,
      category: template.category,
      source: template.image_url,
      price: template.price,
      kind: 'community' as const,
      isOwner: template.owner_id === user?.id,
      owned: template.owner_id === user?.id || template.price <= 0 || purchased.has(template.id),
      template,
    })),
    [templates, purchased, user?.id],
  )

  const categories = useMemo(
    () => ['All', ...Array.from(new Set([...builtIns.map(item => item.category), ...dbCategories]))],
    [builtIns, dbCategories],
  )

  const visible = useMemo(() => {
    const query = search.toLowerCase().trim()
    return [...community, ...builtIns].filter(item =>
      (category === 'All' || item.category === category) && item.name.toLowerCase().includes(query))
  }, [community, builtIns, category, search])

  const handleUse = async (item: DisplayTemplate) => {
    setActionError('')
    setApplying(item.key)
    try {
      if (item.kind === 'community' && item.template && !item.owned) {
        await purchaseTemplate(item.template.id)
        setPurchased(prev => new Set(prev).add(item.template!.id))
      }
      await onUseTemplate(item.source, `${item.name}.jpeg`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'This template could not be used.')
    } finally {
      setApplying(null)
    }
  }

  const handleDelete = async (item: DisplayTemplate) => {
    if (!item.template) return
    setActionError('')
    try {
      await deleteTemplate(item.template)
      await refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'This template could not be removed.')
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <PageIntro
        eyebrow="Template marketplace"
        title="Templates"
        copy="Start from a polished reference, or list your own template to earn Spyda credits every time someone uses it."
        action={(
          <button type="button" onClick={() => setShowList(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> List a template
          </button>
        )}
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map(value => <button key={value} type="button" onClick={() => setCategory(value)} className={`h-9 shrink-0 rounded-lg border px-4 text-xs font-semibold ${category === value ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/[0.08] text-muted-foreground'}`}>{value}</button>)}
        </div>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 sm:w-64"><Search className="h-4 w-4 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search templates" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      </div>

      {marketError && <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs leading-5 text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{marketError}</div>}
      {actionError && <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs leading-5 text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{actionError}<button type="button" aria-label="Dismiss" onClick={() => setActionError('')} className="ml-auto text-red-200/70 hover:text-red-100"><X className="h-4 w-4" /></button></div>}

      {loadingMarket && !templates.length && (
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading community templates…</div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {visible.map(item => {
          const isApplying = applying === item.key
          const paid = item.kind === 'community' && item.price > 0 && !item.owned
          return (
            <article key={item.key} className="group flex flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
              <div className="relative aspect-[4/5] overflow-hidden bg-[#0a0a0c]">
                <img src={item.source} alt={`${item.name} template`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                {item.kind === 'spyda' ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[9px] font-semibold uppercase text-white"><Sparkles className="h-3 w-3 text-primary" /> Spyda pick</span>
                ) : item.isOwner ? (
                  <span className="absolute left-2 top-2 rounded bg-primary px-2 py-1 text-[9px] font-semibold uppercase text-primary-foreground">Your listing</span>
                ) : (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[9px] font-semibold uppercase text-white"><Store className="h-3 w-3 text-primary" /> Community</span>
                )}
                {item.kind === 'community' && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
                    {item.price > 0 ? <><SpydaCreditMark className="h-3 w-3" /> {item.price.toLocaleString()}</> : 'Free'}
                  </span>
                )}
                {item.isOwner && (
                  <button type="button" onClick={() => handleDelete(item)} aria-label={`Remove ${item.name}`} title="Remove listing" className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/70 text-white/80 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <p className="truncate text-sm font-semibold">{item.name}</p>
                <p className="mt-1 text-[10px] uppercase text-muted-foreground">{item.category}</p>
                <button type="button" disabled={applying !== null} onClick={() => handleUse(item)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50">
                  {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutTemplate className="h-4 w-4" />}
                  {paid ? <>Use · {item.price.toLocaleString()}<SpydaCreditMark className="h-3.5 w-3.5" /></> : 'Use template'}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {!loadingMarket && !visible.length && (
        <div className="mt-6"><EmptyLibrary icon={LayoutTemplate} title="No matching templates" copy="Try another category or search term, or list your own template for the community." /></div>
      )}

      {showList && (
        <ListTemplateDialog
          categories={dbCategories.length ? dbCategories : builtIns.map(item => item.category)}
          userId={user?.id}
          onClose={() => setShowList(false)}
          onListed={() => { setShowList(false); void refresh() }}
        />
      )}
    </div>
  )
}

function ListTemplateDialog({ categories, userId, onClose, onListed }: {
  categories: string[]
  userId?: string
  onClose: () => void
  onListed: () => void
}) {
  const uniqueCategories = useMemo(() => Array.from(new Set(categories)).sort((a, b) => a.localeCompare(b)), [categories])
  const [name, setName] = useState('')
  const [category, setCategory] = useState(uniqueCategories[0] ?? '')
  const [useCustom, setUseCustom] = useState(uniqueCategories.length === 0)
  const [customCategory, setCustomCategory] = useState('')
  const [price, setPrice] = useState('25')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [balance, setBalance] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    if (!userId) return
    supabase.from('profiles').select('wallet_balance').eq('id', userId).single().then(({ data }) => {
      if (active) setBalance(Number(data?.wallet_balance ?? 0))
    })
    return () => { active = false }
  }, [userId])

  const chosenCategory = useCustom ? customCategory.trim() : category
  const priceValue = Math.max(0, Math.floor(Number(price) || 0))
  const lowBalance = balance !== null && balance < TEMPLATE_LISTING_FEE

  const pickImage = (selected?: File) => {
    if (!selected) return
    if (!selected.type.startsWith('image/')) return setError('Choose an image file.')
    if (selected.size > 8 * 1024 * 1024) return setError('Choose an image smaller than 8 MB.')
    setError('')
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
  }

  const submit = async () => {
    if (!userId) return setError('Sign in to list a template.')
    if (!name.trim()) return setError('Give your template a name.')
    if (!chosenCategory) return setError('Choose or enter a category.')
    if (!file) return setError('Upload a preview image for your template.')
    if (lowBalance) return setError(`You need ${TEMPLATE_LISTING_FEE} Spyda credits to list a template.`)
    setSubmitting(true)
    setError('')
    try {
      const { url, path } = await uploadTemplateImage(userId, file)
      await listTemplate({ name: name.trim(), category: chosenCategory, price: priceValue, imageUrl: url, imagePath: path, description: description.trim() })
      onListed()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your template could not be listed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="List a template">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-[#0c0d0f] p-5 sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-primary"><Store className="h-3.5 w-3.5" /> Template marketplace</div>
            <h3 className="font-heading text-lg font-semibold">List your template</h3>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">Listing costs <span className="inline-flex items-center gap-1 font-semibold text-foreground"><SpydaCreditMark className="h-3 w-3" />{TEMPLATE_LISTING_FEE} credits</span>. You keep every credit buyers pay to use it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Preview image</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={event => pickImage(event.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/[0.14] bg-white/[0.02] text-muted-foreground hover:border-primary/40">
              {preview ? <img src={preview} alt="Template preview" className="h-full w-full object-contain" /> : <span className="flex flex-col items-center gap-2 text-xs"><ImagePlus className="h-6 w-6 text-primary" /> Upload template image</span>}
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="tpl-name">Template name</label>
            <input id="tpl-name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Weekend sale flyer" className="mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3 text-sm outline-none focus:border-primary/50" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor="tpl-category">Category</label>
              <button type="button" onClick={() => { setUseCustom(value => !value); setError('') }} className="text-[11px] font-semibold text-primary">{useCustom ? 'Choose from list' : '+ New category'}</button>
            </div>
            {useCustom ? (
              <input id="tpl-category" value={customCategory} onChange={event => setCustomCategory(event.target.value)} placeholder="Add a new category" className="mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3 text-sm outline-none focus:border-primary/50" />
            ) : (
              <select id="tpl-category" value={category} onChange={event => setCategory(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3 text-sm outline-none focus:border-primary/50">
                {uniqueCategories.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            )}
            {useCustom && <p className="mt-1.5 text-[11px] text-muted-foreground">New categories are added to the shared list automatically.</p>}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="tpl-price">Price buyers pay (Spyda credits)</label>
            <div className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-background px-3">
              <SpydaCreditMark className="h-4 w-4" />
              <input id="tpl-price" type="number" min="0" step="1" value={price} onChange={event => setPrice(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              <span className="text-xs text-muted-foreground">credits</span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Set 0 to share it for free. Buyers pay once, then reuse it anytime.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="tpl-desc">Description <span className="font-normal">(optional)</span></label>
            <textarea id="tpl-desc" value={description} onChange={event => setDescription(event.target.value)} rows={2} placeholder="What is this template best for?" className="mt-2 w-full rounded-lg border border-white/[0.08] bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>

          {error && <p className="flex items-start gap-2 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
          {lowBalance && !error && <p className="flex items-start gap-2 text-xs text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />You need {TEMPLATE_LISTING_FEE} Spyda credits to list. Fund your wallet first.</p>}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">{balance !== null && <>Balance: <span className="inline-flex items-center gap-1 font-semibold text-foreground"><SpydaCreditMark className="h-3 w-3" />{balance.toLocaleString()}</span></>}</p>
          <button type="button" disabled={submitting || lowBalance} onClick={submit} className="inline-flex h-10 min-w-40 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Listing…</> : <>List for {TEMPLATE_LISTING_FEE}<SpydaCreditMark className="h-3.5 w-3.5" /></>}
          </button>
        </div>
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
