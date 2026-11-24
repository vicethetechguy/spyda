import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTime, type MediaItem } from '../../lib/video/timeline'
import type { SavedVideoProject } from '../../lib/video/video-projects'
import {
  Clapperboard, Folder, FolderPlus, Image as ImageIcon, Library, Loader2, MusicNote, Pause, Play, Plus, Search, Star, Trash2, Upload, Zap,
} from '../ui/icons'

/**
 * The Media page: every file in the project, organised. Bins on the left
 * (smart filters, your folders, your projects), the files in the middle, and
 * a large preview with the file's details and actions on the right.
 */

type Bin = 'all' | 'video' | 'image' | 'audio' | 'sfx' | 'favourites' | 'unused' | `folder:${string}`
type Sort = 'newest' | 'name' | 'length'

export type MediaPageProps = {
  media: MediaItem[]
  usage: Map<string, number>
  folders: string[]
  onFoldersChange: (folders: string[]) => void
  importing: boolean
  onImport: () => void
  onAdd: (item: MediaItem) => void
  onLocate: (item: MediaItem) => void
  onRemove: (item: MediaItem) => void
  onUpdate: (id: string, patch: Partial<MediaItem>) => void
  projects: SavedVideoProject[]
  projectId: string
  onOpenProject: (id: string) => void
  onNewProject: () => void
  onDeleteProject: (id: string) => void
}

const KIND_LABEL: Record<MediaItem['kind'], string> = { video: 'Video', image: 'Picture', audio: 'Music' }

function fileSize(bytes?: number) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export default function MediaPage(props: MediaPageProps) {
  const { media, usage, folders, onFoldersChange, importing, onImport, onAdd, onLocate, onRemove, onUpdate, projects, projectId, onOpenProject, onNewProject, onDeleteProject } = props
  const [bin, setBin] = useState<Bin>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const imported = media.filter(item => !item.sfx)
  const effects = media.filter(item => item.sfx)
  const inBin = (item: MediaItem, which: Bin) => {
    if (which === 'sfx') return Boolean(item.sfx)
    if (item.sfx) return false
    if (which === 'all') return true
    if (which === 'favourites') return Boolean(item.favourite)
    if (which === 'unused') return !usage.get(item.id)
    if (which.startsWith('folder:')) return item.folder === which.slice(7)
    return item.kind === which
  }
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = media.filter(item => inBin(item, bin) && (!needle || item.name.toLowerCase().includes(needle)))
    return [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'length' ? b.duration - a.duration : Date.parse(b.addedAt ?? '0') - Date.parse(a.addedAt ?? '0')))
    // inBin reads usage and the item fields only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, bin, query, sort, usage])
  const selected = media.find(item => item.id === selectedId) ?? shown[0] ?? null

  const bins: Array<{ id: Bin; label: string; icon: typeof Library; count: number }> = [
    { id: 'all', label: 'All media', icon: Library, count: imported.length },
    { id: 'video', label: 'Videos', icon: Clapperboard, count: imported.filter(item => item.kind === 'video').length },
    { id: 'image', label: 'Pictures', icon: ImageIcon, count: imported.filter(item => item.kind === 'image').length },
    { id: 'audio', label: 'Music', icon: MusicNote, count: imported.filter(item => item.kind === 'audio').length },
    { id: 'sfx', label: 'Sound effects', icon: Zap, count: effects.length },
    { id: 'favourites', label: 'Favourites', icon: Star, count: imported.filter(item => item.favourite).length },
    { id: 'unused', label: 'Not used yet', icon: Folder, count: imported.filter(item => !usage.get(item.id)).length },
  ]

  const addFolder = (name: string) => {
    const clean = name.trim().slice(0, 40)
    setNewFolder(null)
    if (!clean || folders.includes(clean)) return
    onFoldersChange([...folders, clean])
    setBin(`folder:${clean}`)
  }
  const removeFolder = (name: string) => {
    onFoldersChange(folders.filter(item => item !== name))
    for (const item of media) if (item.folder === name) onUpdate(item.id, { folder: null })
    if (bin === `folder:${name}`) setBin('all')
  }

  const binButton = (id: Bin, label: string, Icon: typeof Library, count: number, extra?: React.ReactNode) => (
    <div key={id} className="group relative">
      <button
        type="button"
        onClick={() => setBin(id)}
        onDragOver={id.startsWith('folder:') ? event => { if (event.dataTransfer.types.includes('application/x-spyda-media')) { event.preventDefault(); setDragOver(id) } } : undefined}
        onDragLeave={() => setDragOver(current => (current === id ? null : current))}
        onDrop={id.startsWith('folder:') ? event => { event.preventDefault(); setDragOver(null); const mediaId = event.dataTransfer.getData('application/x-spyda-media'); if (mediaId) onUpdate(mediaId, { folder: id.slice(7) }) } : undefined}
        className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] transition-colors ${bin === id ? 'bg-primary/12 font-semibold text-foreground ring-1 ring-inset ring-primary/30' : dragOver === id ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-white/[0.05] hover:text-foreground'}`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${bin === id ? 'text-primary' : ''}`} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="font-mono text-[10px] opacity-60">{count}</span>
      </button>
      {extra}
    </div>
  )

  return (
    <div className="mac-workspace flex min-h-0 flex-1">
      {/* Bins */}
      <aside className="mac-sidebar flex w-[240px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#111214] p-3">
        <button type="button" onClick={onImport} className="mb-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground">
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import media
        </button>
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Library</p>
        <div className="space-y-0.5">{bins.map(item => binButton(item.id, item.label, item.icon, item.count))}</div>

        <div className="mb-1 mt-4 flex items-center justify-between px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Folders</p>
          <button type="button" onClick={() => setNewFolder('')} title="New folder" aria-label="New folder" className="rounded p-1 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"><FolderPlus className="h-3.5 w-3.5" /></button>
        </div>
        <div className="space-y-0.5">
          {folders.map(name => binButton(`folder:${name}`, name, Folder, imported.filter(item => item.folder === name).length, (
            <button type="button" onClick={() => removeFolder(name)} title="Delete folder (the files stay in All media)" aria-label={`Delete folder ${name}`} className="absolute right-8 top-1.5 hidden rounded p-0.5 text-muted-foreground hover:text-red-300 group-hover:block"><Trash2 className="h-3 w-3" /></button>
          )))}
          {newFolder != null ? (
            <input autoFocus value={newFolder} onChange={event => setNewFolder(event.target.value)} onBlur={() => addFolder(newFolder)} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') addFolder(newFolder); if (event.key === 'Escape') setNewFolder(null) }} placeholder="Folder name" className="h-8 w-full rounded-lg bg-white/[0.06] px-2.5 text-[12px] outline-none ring-1 ring-primary/50" />
          ) : null}
          {!folders.length && newFolder == null ? <p className="px-1 text-[10px] leading-4 text-muted-foreground">Make folders like “B-roll” or “Voice-overs”, then drag files onto them.</p> : null}
        </div>

        <div className="mb-1 mt-4 flex items-center justify-between px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Projects</p>
          <button type="button" onClick={onNewProject} title="New video project" aria-label="New video project" className="rounded p-1 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <div className="space-y-1">
          {projects.map(item => (
            <div key={item.id} className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 ${item.id === projectId ? 'border-primary/40 bg-primary/10' : 'border-transparent hover:bg-white/[0.04]'}`}>
              <button type="button" onClick={() => item.id !== projectId && onOpenProject(item.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={item.id === projectId ? 'Open now' : `Open ${item.name}`}>
                {item.cover ? <img src={item.cover} alt="" className="h-7 w-10 shrink-0 rounded bg-black object-cover" /> : <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded bg-white/[0.05]"><Clapperboard className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium">{item.name}</span>
                  <span className="block text-[9px] text-muted-foreground">{item.project.clips.length} clips · {new Date(item.updatedAt).toLocaleDateString()}</span>
                </span>
              </button>
              {item.id !== projectId ? <button type="button" onClick={() => { if (window.confirm(`Delete “${item.name}”? Its edit and the files only it uses are removed from this device.`)) onDeleteProject(item.id) }} title="Delete project" aria-label={`Delete ${item.name}`} className="hidden rounded p-1 text-muted-foreground hover:text-red-300 group-hover:block"><Trash2 className="h-3 w-3" /></button> : null}
            </div>
          ))}
        </div>
      </aside>

      {/* Files */}
      <section className="mac-window flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/[0.05] px-2.5 focus-within:ring-1 focus-within:ring-primary/60">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="Search files" aria-label="Search files" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground" />
          </label>
          <div role="radiogroup" aria-label="Sort" className="flex shrink-0 items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
            {([['newest', 'Newest'], ['name', 'Name'], ['length', 'Length']] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={sort === id} onClick={() => setSort(id)} className={`h-7 rounded-md px-2.5 text-[11px] ${sort === id ? 'bg-white/[0.12] font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {shown.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              {shown.map(item => {
                const used = usage.get(item.id) ?? 0
                const active = selected?.id === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    draggable={!item.sfx}
                    onDragStart={event => { event.dataTransfer.setData('application/x-spyda-media', item.id); event.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => setSelectedId(item.id)}
                    onDoubleClick={() => onAdd(item)}
                    title="Click to preview, double-click to add to the edit"
                    className={`group overflow-hidden rounded-xl border bg-black/30 text-left transition-colors ${active ? 'border-primary ring-1 ring-primary/50' : 'border-white/[0.08] hover:border-white/25'}`}
                  >
                    <span className="relative block aspect-video bg-[#16171a]">
                      {item.thumbnail ? <img src={item.thumbnail} alt="" draggable={false} className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center text-muted-foreground">{item.sfx ? <Zap className="h-6 w-6 text-[#7cc7ff]" /> : <MusicNote className="h-6 w-6 text-[#ffb36b]" />}</span>}
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 font-mono text-[9px]">{item.kind === 'image' ? 'Picture' : formatTime(item.duration)}</span>
                      {used ? <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 text-[9px] font-semibold text-primary-foreground">In use · {used}</span> : null}
                      {item.favourite ? <Star className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-amber-300" /> : null}
                    </span>
                    <span className="block truncate px-2 pt-1.5 text-[11px] font-medium">{item.name}</span>
                    <span className="block truncate px-2 pb-1.5 text-[10px] text-muted-foreground">{item.sfx ? 'Sound effect' : KIND_LABEL[item.kind]}{item.width ? ` · ${item.width}×${item.height}` : ''}{item.folder ? ` · ${item.folder}` : ''}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <button type="button" onClick={onImport} className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-dashed border-white/[0.14] px-8 py-10 text-center hover:border-primary/50">
              <Upload className="h-6 w-6 text-primary" />
              <span className="text-[13px] font-semibold">{media.length ? 'Nothing in this bin yet' : 'Import your first files'}</span>
              <span className="text-[11px] leading-5 text-muted-foreground">Videos, pictures and music. Drop them anywhere on this page. They stay on this device and are saved with the project.</span>
            </button>
          )}
        </div>
      </section>

      {/* Preview and details */}
      <aside className="mac-sidebar flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-white/[0.06] bg-[#111214]">
        {selected ? <Inspector key={selected.id} item={selected} used={usage.get(selected.id) ?? 0} folders={folders} onAdd={onAdd} onLocate={onLocate} onRemove={onRemove} onUpdate={onUpdate} /> : (
          <p className="p-5 text-[12px] leading-5 text-muted-foreground">Select a file to preview it and see its details.</p>
        )}
      </aside>
    </div>
  )
}

function Inspector({ item, used, folders, onAdd, onLocate, onRemove, onUpdate }: {
  item: MediaItem; used: number; folders: string[]
  onAdd: (item: MediaItem) => void; onLocate: (item: MediaItem) => void; onRemove: (item: MediaItem) => void; onUpdate: (id: string, patch: Partial<MediaItem>) => void
}) {
  const [name, setName] = useState(item.name)
  const [playing, setPlaying] = useState(false)
  const player = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  useEffect(() => () => player.current?.pause(), [])
  const toggle = () => {
    const element = player.current
    if (!element) return
    if (element.paused) void element.play().then(() => setPlaying(true)).catch(() => undefined)
    else { element.pause(); setPlaying(false) }
  }
  const rows: Array<[string, string]> = [
    ['Type', item.sfx ? 'Sound effect' : KIND_LABEL[item.kind]],
    ['Length', item.kind === 'image' ? 'Still' : formatTime(item.duration)],
    ['Size', item.width ? `${item.width} × ${item.height}` : '—'],
    ['File', item.sfx ? 'Built into Spyda' : fileSize(item.size)],
    ['Added', item.addedAt ? new Date(item.addedAt).toLocaleString() : item.sfx ? '—' : 'Before this update'],
    ['In the edit', used ? `${used} ${used === 1 ? 'time' : 'times'}` : 'Not yet'],
  ]
  return (
    <div className="flex flex-col">
      <div className="relative flex aspect-video items-center justify-center bg-black">
        {item.kind === 'video' ? (
          <video ref={node => { player.current = node }} src={item.url} className="h-full w-full object-contain" playsInline onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onClick={toggle} />
        ) : item.kind === 'image' ? (
          <img src={item.url} alt="" className="h-full w-full object-contain" />
        ) : (
          <>
            <audio ref={node => { player.current = node }} src={item.url} onEnded={() => setPlaying(false)} />
            {item.sfx ? <Zap className="h-10 w-10 text-[#7cc7ff]" /> : <MusicNote className="h-10 w-10 text-[#ffb36b]" />}
          </>
        )}
        {item.kind !== 'image' ? (
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="absolute bottom-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_14px_rgba(157,250,176,0.35)]">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
          </button>
        ) : null}
      </div>
      <div className="space-y-4 p-4">
        {item.sfx ? <p className="text-[14px] font-semibold">{item.name}</p> : (
          <input value={name} onChange={event => setName(event.target.value)} onBlur={() => { const clean = name.trim(); if (clean && clean !== item.name) onUpdate(item.id, { name: clean }); else setName(item.name) }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }} aria-label="File name" title="Click to rename" className="w-full rounded-md bg-transparent px-1 py-0.5 text-[14px] font-semibold outline-none hover:bg-white/[0.04] focus:bg-white/[0.06] focus:ring-1 focus:ring-primary/50" />
        )}
        <dl className="grid grid-cols-[92px_1fr] gap-y-1.5 text-[11px]">
          {rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="truncate">{value}</dd></div>)}
        </dl>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onAdd(item)} className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> {item.kind === 'audio' ? 'Add at the playhead' : 'Add to the end of the edit'}</button>
          {used ? <button type="button" onClick={() => onLocate(item)} className="h-8 rounded-lg border border-white/[0.1] text-[11px] font-semibold hover:bg-white/[0.06]">Show in the edit</button> : null}
          {!item.sfx ? <button type="button" onClick={() => onUpdate(item.id, { favourite: !item.favourite })} aria-pressed={Boolean(item.favourite)} className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-semibold ${item.favourite ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-white/[0.1] hover:bg-white/[0.06]'}`}><Star className="h-3.5 w-3.5" /> {item.favourite ? 'Favourite' : 'Add to favourites'}</button> : null}
          {!item.sfx && !used ? <button type="button" onClick={() => onRemove(item)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] text-[11px] font-semibold text-muted-foreground hover:border-red-400/40 hover:text-red-200"><Trash2 className="h-3.5 w-3.5" /> Remove</button> : null}
        </div>
        {!item.sfx ? (
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Folder</span>
            <select value={item.folder ?? ''} onChange={event => onUpdate(item.id, { folder: event.target.value || null })} className="mt-1 h-8 w-full rounded-lg border border-white/[0.08] bg-black/40 px-2 text-[12px] outline-none">
              <option value="">No folder</option>
              {folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  )
}
