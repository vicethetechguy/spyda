/**
 * Spyda's icon set: Solar, line-duotone, drawn from the SVGs in Font/.
 *
 * Screens import icons from here under their old lucide names, so call sites
 * keep their sizing classes. The markup lives in solar-icons.generated.ts,
 * built by scripts/build-solar-icons.mjs; add new icons there, not here by hand.
 * A heavy lucide stroke (2.2+) draws the same glyph with a thicker line.
 */
import { forwardRef, type ComponentType, type SVGProps } from 'react'
import { SOLAR_ICONS, type SolarIconName } from './solar-icons.generated'

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref' | 'children' | 'dangerouslySetInnerHTML'> & {
  size?: number | string
  /** Kept for lucide call sites: 2.2 and up draws a heavier line. */
  strokeWidth?: number | string
}

/** Kept so existing `LucideIcon` props and records still type-check. */
export type LucideIcon = ComponentType<IconProps>

function icon(name: SolarIconName) {
  const markup = { __html: SOLAR_ICONS[name] }
  const Wrapped = forwardRef<SVGSVGElement, IconProps>(function SpydaIcon({ strokeWidth, size = 24, className, ...rest }, ref) {
    const classes = ['spyda-icon', Number(strokeWidth) >= 2.2 && 'spyda-icon--bold', className].filter(Boolean).join(' ')
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden={rest['aria-label'] ? undefined : true}
        focusable="false"
        {...rest}
        className={classes}
        dangerouslySetInnerHTML={markup}
      />
    )
  })
  Wrapped.displayName = name
  return Wrapped
}

export const AlertTriangle = icon('AlertTriangle')
export const Archive = icon('Archive')
export const ArchiveRestore = icon('ArchiveRestore')
export const ArrowDown = icon('ArrowDown')
export const ArrowDownToLine = icon('ArrowDownToLine')
export const ArrowLeft = icon('ArrowLeft')
export const ArrowRight = icon('ArrowRight')
export const ArrowUp = icon('ArrowUp')
export const ArrowUpRight = icon('ArrowUpRight')
export const AtSign = icon('AtSign')
export const Award = icon('Award')
export const BadgeCheck = icon('BadgeCheck')
export const Bell = icon('Bell')
export const Blocks = icon('Blocks')
export const BookOpen = icon('BookOpen')
export const Bot = icon('Bot')
export const CalendarDays = icon('CalendarDays')
export const Check = icon('Check')
export const CheckCheck = icon('CheckCheck')
export const CheckCircle2 = icon('CheckCircle2')
export const ChevronDown = icon('ChevronDown')
export const ChevronRight = icon('ChevronRight')
export const CircleCheck = icon('CircleCheck')
export const CircleX = icon('CircleX')
export const Clapperboard = icon('Clapperboard')
export const Clock = icon('Clock')
export const Clock3 = icon('Clock3')
export const Coins = icon('Coins')
export const Copy = icon('Copy')
export const Cpu = icon('Cpu')
export const CreditCard = icon('CreditCard')
export const DollarSign = icon('DollarSign')
export const Download = icon('Download')
export const ExternalLink = icon('ExternalLink')
export const Eye = icon('Eye')
export const EyeOff = icon('EyeOff')
export const FileCode2 = icon('FileCode2')
export const FileImage = icon('FileImage')
export const FolderKanban = icon('FolderKanban')
export const Gauge = icon('Gauge')
export const Gift = icon('Gift')
export const Globe2 = icon('Globe2')
export const GraduationCap = icon('GraduationCap')
export const Grid2X2 = icon('Grid2X2')
export const Hash = icon('Hash')
export const History = icon('History')
export const Image = icon('Image')
export const ImagePlus = icon('ImagePlus')
export const ImageUp = icon('ImageUp')
export const KeyRound = icon('KeyRound')
export const Layers = icon('Layers')
export const Layers3 = icon('Layers3')
export const LayoutDashboard = icon('LayoutDashboard')
export const LayoutTemplate = icon('LayoutTemplate')
export const Library = icon('Library')
export const Loader2 = icon('Loader2')
export const Lock = icon('Lock')
export const LockKeyhole = icon('LockKeyhole')
export const LogOut = icon('LogOut')
export const Mail = icon('Mail')
export const Maximize2 = icon('Maximize2')
export const Medal = icon('Medal')
export const MessageSquareText = icon('MessageSquareText')
export const Mic = icon('Mic')
export const Monitor = icon('Monitor')
export const MousePointerClick = icon('MousePointerClick')
export const Move = icon('Move')
export const Network = icon('Network')
export const Palette = icon('Palette')
export const PanelLeftClose = icon('PanelLeftClose')
export const PanelLeftOpen = icon('PanelLeftOpen')
export const Paperclip = icon('Paperclip')
export const Pause = icon('Pause')
export const Play = icon('Play')
export const Plus = icon('Plus')
export const QrCode = icon('QrCode')
export const ReceiptText = icon('ReceiptText')
export const Redo2 = icon('Redo2')
export const RefreshCw = icon('RefreshCw')
export const Repeat2 = icon('Repeat2')
export const Rocket = icon('Rocket')
export const RotateCcw = icon('RotateCcw')
export const ScanSearch = icon('ScanSearch')
export const Search = icon('Search')
export const Send = icon('Send')
export const Settings = icon('Settings')
export const Shapes = icon('Shapes')
export const Share = icon('Share')
export const Shield = icon('Shield')
export const ShieldCheck = icon('ShieldCheck')
export const SlidersHorizontal = icon('SlidersHorizontal')
export const Smartphone = icon('Smartphone')
export const Sparkles = icon('Sparkles')
export const Square = icon('Square')
export const SquarePlus = icon('SquarePlus')
export const Store = icon('Store')
export const Target = icon('Target')
export const Ticket = icon('Ticket')
export const Trash2 = icon('Trash2')
export const Trophy = icon('Trophy')
export const Type = icon('Type')
export const Undo2 = icon('Undo2')
export const Upload = icon('Upload')
export const UserCog = icon('UserCog')
export const Users = icon('Users')
export const Wallet = icon('Wallet')
export const Wand2 = icon('Wand2')
export const WandSparkles = icon('WandSparkles')
export const Wrench = icon('Wrench')
export const X = icon('X')
export const XCircle = icon('XCircle')
export const Zap = icon('Zap')
export const DesignTools = icon('DesignTools')
export const Motion = icon('Motion')
export const Transition = icon('Transition')
export const ListCheck = icon('ListCheck')
