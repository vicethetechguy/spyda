// Builds src/components/ui/solar-icons.generated.ts from the Solar SVGs in Font/.
//
//   node scripts/build-solar-icons.mjs [path/to/Font]
//
// Spyda's icons all come from that folder (Solar, line-duotone style). The app
// imports icons under their old lucide names from src/components/ui/icons.tsx;
// this table says which Solar file each name is drawn from. To add an icon,
// add a row, run the script, and export the name from icons.tsx.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fontDir = resolve(process.argv[2] ?? join(root, 'Font'))
const STYLE = 'line-duotone'

/**
 * name -> Solar file (without the style suffix).
 * `glyph` keeps only the mark inside a circle icon (Solar has no bare check,
 * cross or plus) and scales it up to fill the square. `flip` mirrors it.
 */
const MAP = {
  AlertTriangle: 'danger-triangle',
  Archive: 'archive',
  ArchiveRestore: 'archive-up',
  ArrowDown: 'arrow-down',
  ArrowDownToLine: 'download-minimalistic',
  ArrowLeft: 'arrow-left',
  ArrowRight: 'arrow-right',
  ArrowUp: 'arrow-up',
  ArrowUpRight: 'arrow-right-up',
  AtSign: 'mention-circle',
  Award: 'medal-ribbon-star',
  BadgeCheck: 'verified-check',
  Bell: 'bell',
  Blocks: 'widget-add',
  BookOpen: 'book-2',
  Bot: 'cpu-bolt',
  CalendarDays: 'calendar',
  Check: { file: 'check-circle', glyph: 1.6 },
  CheckCheck: 'check-read',
  CheckCircle2: 'check-circle',
  ChevronDown: 'alt-arrow-down',
  ChevronRight: 'alt-arrow-right',
  CircleCheck: 'check-circle',
  CircleX: 'close-circle',
  Clapperboard: 'clapperboard-play',
  Clock: 'clock-circle',
  Clock3: 'clock-circle',
  Coins: 'dollar',
  Copy: 'copy',
  Cpu: 'cpu',
  CreditCard: 'card',
  DollarSign: 'dollar-minimalistic',
  Download: 'download-minimalistic',
  ExternalLink: 'square-arrow-right-up',
  Eye: 'eye',
  EyeOff: 'eye-closed',
  FileCode2: 'code-file',
  FileImage: 'gallery-minimalistic',
  FolderKanban: 'folder-with-files',
  Gauge: 'spedometer-middle',
  Gift: 'gift',
  Globe2: 'global',
  GraduationCap: 'square-academic-cap',
  Grid2X2: 'widget',
  Hash: 'hashtag',
  History: 'history',
  Image: 'gallery',
  ImagePlus: 'gallery-add',
  ImageUp: 'gallery-send',
  KeyRound: 'key',
  Layers: 'layers',
  Layers3: 'layers-minimalistic',
  LayoutDashboard: 'widget-2',
  LayoutTemplate: 'widget-5',
  Library: 'library',
  Loader2: 'refresh',
  Lock: 'lock',
  LockKeyhole: 'lock-keyhole',
  LogOut: 'logout-2',
  Mail: 'letter',
  Maximize2: 'maximize',
  Medal: 'medal-star',
  MessageSquareText: 'chat-square',
  Mic: 'microphone',
  Monitor: 'monitor',
  MousePointerClick: 'cursor',
  Move: 'maximize-square-minimalistic',
  Network: 'structure',
  Palette: 'palette',
  PanelLeftClose: { file: 'sidebar-minimalistic', flip: true },
  PanelLeftOpen: { file: 'sidebar-minimalistic', flip: true },
  Paperclip: 'paperclip',
  Pause: 'pause',
  Play: 'play',
  Plus: { file: 'add-circle', glyph: 1.6 },
  QrCode: 'qr-code',
  ReceiptText: 'bill-list',
  Redo2: 'undo-right',
  RefreshCw: 'refresh',
  Repeat2: 'repeat',
  Rocket: 'rocket',
  RotateCcw: 'restart',
  ScanSearch: 'object-scan',
  Search: 'magnifer',
  Send: 'plain',
  Settings: 'settings',
  Shapes: 'widget-6',
  Share: 'share',
  Shield: 'shield',
  ShieldCheck: 'shield-check',
  SlidersHorizontal: 'tuning-2',
  Smartphone: 'smartphone',
  Sparkles: 'stars',
  Square: 'stop',
  SquarePlus: 'add-square',
  Store: 'shop',
  Target: 'target',
  Ticket: 'ticket',
  Trash2: 'trash-bin-minimalistic',
  Trophy: 'cup-star',
  Type: 'text',
  Undo2: 'undo-left',
  Upload: 'upload-minimalistic',
  UserCog: 'user-id',
  Users: 'users-group-rounded',
  Wallet: 'wallet',
  Wand2: 'magic-stick-3',
  WandSparkles: 'magic-stick-3',
  Wrench: 'sledgehammer',
  DesignTools: 'ruler-cross-pen',
  Motion: 'stopwatch-play',
  Transition: 'round-transfer-horizontal',
  ListCheck: 'list-check',
  X: { file: 'close-circle', glyph: 1.8 },
  XCircle: 'close-circle',
  Zap: 'bolt',
}

function inner(svg) {
  const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
  if (!match) throw new Error('not an svg')
  return match[1].trim()
}

function build(spec) {
  const { file, glyph, flip } = typeof spec === 'string' ? { file: spec } : spec
  const path = join(fontDir, `${file}-${STYLE}.svg`)
  let body = inner(readFileSync(path, 'utf8'))
  if (glyph) {
    // Drop the outline circle, then scale the mark about the centre. The
    // stroke is divided by the same factor so it keeps the set's weight.
    body = body.replace(/<circle[^>]*\/>/g, '')
    const width = +(1.5 / glyph).toFixed(3)
    body = body.replace(/stroke-width="1\.5"/g, `stroke-width="${width}"`)
    body = `<g transform="translate(12 12) scale(${glyph}) translate(-12 -12)">${body}</g>`
  }
  if (flip) body = `<g transform="matrix(-1 0 0 1 24 0)">${body}</g>`
  return { file, body }
}

const rows = Object.entries(MAP).map(([name, spec]) => {
  const { file, body } = build(spec)
  return `  // ${file}\n  ${name}: ${JSON.stringify(body)},`
})

const out = `// Generated by scripts/build-solar-icons.mjs from Font/*-${STYLE}.svg. Do not edit.
export const SOLAR_ICONS = {
${rows.join('\n')}
} as const

export type SolarIconName = keyof typeof SOLAR_ICONS
`
writeFileSync(join(root, 'src/components/ui/solar-icons.generated.ts'), out)
console.log(`wrote ${rows.length} icons from ${fontDir}`)
