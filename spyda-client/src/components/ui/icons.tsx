/**
 * Spyda's icon set: Phosphor, duotone by default.
 *
 * The app was drawn with lucide; every screen now imports from here instead,
 * under the same names, so call sites keep their sizing classes. Duotone gives
 * filled shapes a soft tinted body and keeps pure line glyphs (chevrons,
 * arrows, checks) crisp. A heavy lucide stroke (2.2+) maps to Phosphor's bold.
 * Add new icons here (map a name to a Phosphor glyph), not from lucide-react.
 */
import { forwardRef, type ComponentType, type SVGProps } from 'react'
import {
  Archive as PhArchive,
  ArrowCounterClockwise as PhArrowCounterClockwise,
  ArrowDown as PhArrowDown,
  ArrowLeft as PhArrowLeft,
  ArrowLineDown as PhArrowLineDown,
  ArrowRight as PhArrowRight,
  ArrowSquareOut as PhArrowSquareOut,
  ArrowUUpLeft as PhArrowUUpLeft,
  ArrowUUpRight as PhArrowUUpRight,
  ArrowUp as PhArrowUp,
  ArrowUpRight as PhArrowUpRight,
  ArrowsClockwise as PhArrowsClockwise,
  ArrowsOut as PhArrowsOut,
  ArrowsOutCardinal as PhArrowsOutCardinal,
  At as PhAt,
  Bell as PhBell,
  BookOpenText as PhBookOpenText,
  Books as PhBooks,
  BoxArrowUp as PhBoxArrowUp,
  CalendarDots as PhCalendarDots,
  CaretDown as PhCaretDown,
  CaretRight as PhCaretRight,
  ChatText as PhChatText,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  Checks as PhChecks,
  CircleNotch as PhCircleNotch,
  Clock as PhClock,
  ClockCounterClockwise as PhClockCounterClockwise,
  Coins as PhCoins,
  Copy as PhCopy,
  Cpu as PhCpu,
  CreditCard as PhCreditCard,
  CurrencyDollar as PhCurrencyDollar,
  CursorClick as PhCursorClick,
  DeviceMobile as PhDeviceMobile,
  DownloadSimple as PhDownloadSimple,
  Envelope as PhEnvelope,
  Export as PhExport,
  Eye as PhEye,
  EyeSlash as PhEyeSlash,
  FileCode as PhFileCode,
  FileImage as PhFileImage,
  FilmSlate as PhFilmSlate,
  Gauge as PhGauge,
  GearSix as PhGearSix,
  Gift as PhGift,
  GlobeHemisphereWest as PhGlobeHemisphereWest,
  GraduationCap as PhGraduationCap,
  GridFour as PhGridFour,
  Hash as PhHash,
  ImageSquare as PhImageSquare,
  Kanban as PhKanban,
  Key as PhKey,
  Layout as PhLayout,
  Lightning as PhLightning,
  Lock as PhLock,
  LockKey as PhLockKey,
  MagicWand as PhMagicWand,
  MagnifyingGlass as PhMagnifyingGlass,
  Medal as PhMedal,
  Microphone as PhMicrophone,
  Monitor as PhMonitor,
  Palette as PhPalette,
  PaperPlaneTilt as PhPaperPlaneTilt,
  Paperclip as PhPaperclip,
  Pause as PhPause,
  Play as PhPlay,
  Plus as PhPlus,
  PlusSquare as PhPlusSquare,
  QrCode as PhQrCode,
  Receipt as PhReceipt,
  Repeat as PhRepeat,
  Robot as PhRobot,
  RocketLaunch as PhRocketLaunch,
  Scan as PhScan,
  SealCheck as PhSealCheck,
  Shapes as PhShapes,
  ShareNetwork as PhShareNetwork,
  Shield as PhShield,
  ShieldCheck as PhShieldCheck,
  SidebarSimple as PhSidebarSimple,
  SignOut as PhSignOut,
  SlidersHorizontal as PhSlidersHorizontal,
  Sparkle as PhSparkle,
  Square as PhSquare,
  SquaresFour as PhSquaresFour,
  Stack as PhStack,
  StackSimple as PhStackSimple,
  Storefront as PhStorefront,
  Target as PhTarget,
  TextT as PhTextT,
  Ticket as PhTicket,
  Trash as PhTrash,
  Trophy as PhTrophy,
  UploadSimple as PhUploadSimple,
  UserGear as PhUserGear,
  UsersThree as PhUsersThree,
  Wallet as PhWallet,
  Warning as PhWarning,
  Wrench as PhWrench,
  X as PhX,
  XCircle as PhXCircle,
  type Icon as PhosphorIcon,
  type IconWeight,
} from '@phosphor-icons/react'

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & {
  size?: number | string
  /** Kept for lucide call sites: 2.2 and up draws bold, anything else duotone. */
  strokeWidth?: number | string
  weight?: IconWeight
}

/** Kept so existing `LucideIcon` props and records still type-check. */
export type LucideIcon = ComponentType<IconProps>

function icon(Glyph: PhosphorIcon, name: string) {
  const Wrapped = forwardRef<SVGSVGElement, IconProps>(function SpydaIcon({ strokeWidth, weight, size = 24, ...rest }, ref) {
    const resolved: IconWeight = weight ?? (Number(strokeWidth) >= 2.2 ? 'bold' : 'duotone')
    const className = ['spyda-icon', rest.className].filter(Boolean).join(' ')
    return <Glyph ref={ref} weight={resolved} size={size} {...(rest as Record<string, unknown>)} className={className} />
  })
  Wrapped.displayName = name
  return Wrapped
}

export const AlertTriangle = icon(PhWarning, 'AlertTriangle')
export const Archive = icon(PhArchive, 'Archive')
export const ArchiveRestore = icon(PhBoxArrowUp, 'ArchiveRestore')
export const ArrowDown = icon(PhArrowDown, 'ArrowDown')
export const ArrowDownToLine = icon(PhArrowLineDown, 'ArrowDownToLine')
export const ArrowLeft = icon(PhArrowLeft, 'ArrowLeft')
export const ArrowRight = icon(PhArrowRight, 'ArrowRight')
export const ArrowUp = icon(PhArrowUp, 'ArrowUp')
export const ArrowUpRight = icon(PhArrowUpRight, 'ArrowUpRight')
export const AtSign = icon(PhAt, 'AtSign')
export const Award = icon(PhMedal, 'Award')
export const BadgeCheck = icon(PhSealCheck, 'BadgeCheck')
export const Bell = icon(PhBell, 'Bell')
export const Blocks = icon(PhSquaresFour, 'Blocks')
export const BookOpen = icon(PhBookOpenText, 'BookOpen')
export const Bot = icon(PhRobot, 'Bot')
export const CalendarDays = icon(PhCalendarDots, 'CalendarDays')
export const Check = icon(PhCheck, 'Check')
export const CheckCheck = icon(PhChecks, 'CheckCheck')
export const CheckCircle2 = icon(PhCheckCircle, 'CheckCircle2')
export const ChevronDown = icon(PhCaretDown, 'ChevronDown')
export const ChevronRight = icon(PhCaretRight, 'ChevronRight')
export const CircleCheck = icon(PhCheckCircle, 'CircleCheck')
export const CircleX = icon(PhXCircle, 'CircleX')
export const Clapperboard = icon(PhFilmSlate, 'Clapperboard')
export const Clock = icon(PhClock, 'Clock')
export const Clock3 = icon(PhClock, 'Clock3')
export const Coins = icon(PhCoins, 'Coins')
export const Copy = icon(PhCopy, 'Copy')
export const Cpu = icon(PhCpu, 'Cpu')
export const CreditCard = icon(PhCreditCard, 'CreditCard')
export const DollarSign = icon(PhCurrencyDollar, 'DollarSign')
export const Download = icon(PhDownloadSimple, 'Download')
export const ExternalLink = icon(PhArrowSquareOut, 'ExternalLink')
export const Eye = icon(PhEye, 'Eye')
export const EyeOff = icon(PhEyeSlash, 'EyeOff')
export const FileCode2 = icon(PhFileCode, 'FileCode2')
export const FileImage = icon(PhFileImage, 'FileImage')
export const FolderKanban = icon(PhKanban, 'FolderKanban')
export const Gauge = icon(PhGauge, 'Gauge')
export const Gift = icon(PhGift, 'Gift')
export const Globe2 = icon(PhGlobeHemisphereWest, 'Globe2')
export const GraduationCap = icon(PhGraduationCap, 'GraduationCap')
export const Grid2X2 = icon(PhGridFour, 'Grid2X2')
export const Hash = icon(PhHash, 'Hash')
export const History = icon(PhClockCounterClockwise, 'History')
export const Image = icon(PhImageSquare, 'Image')
export const ImagePlus = icon(PhImageSquare, 'ImagePlus')
export const ImageUp = icon(PhUploadSimple, 'ImageUp')
export const KeyRound = icon(PhKey, 'KeyRound')
export const Layers = icon(PhStack, 'Layers')
export const Layers3 = icon(PhStackSimple, 'Layers3')
export const LayoutDashboard = icon(PhSquaresFour, 'LayoutDashboard')
export const LayoutTemplate = icon(PhLayout, 'LayoutTemplate')
export const Library = icon(PhBooks, 'Library')
export const Loader2 = icon(PhCircleNotch, 'Loader2')
export const Lock = icon(PhLock, 'Lock')
export const LockKeyhole = icon(PhLockKey, 'LockKeyhole')
export const LogOut = icon(PhSignOut, 'LogOut')
export const Mail = icon(PhEnvelope, 'Mail')
export const Maximize2 = icon(PhArrowsOut, 'Maximize2')
export const Medal = icon(PhMedal, 'Medal')
export const MessageSquareText = icon(PhChatText, 'MessageSquareText')
export const Mic = icon(PhMicrophone, 'Mic')
export const Monitor = icon(PhMonitor, 'Monitor')
export const MousePointerClick = icon(PhCursorClick, 'MousePointerClick')
export const Move = icon(PhArrowsOutCardinal, 'Move')
export const Network = icon(PhShareNetwork, 'Network')
export const Palette = icon(PhPalette, 'Palette')
export const PanelLeftClose = icon(PhSidebarSimple, 'PanelLeftClose')
export const PanelLeftOpen = icon(PhSidebarSimple, 'PanelLeftOpen')
export const Paperclip = icon(PhPaperclip, 'Paperclip')
export const Pause = icon(PhPause, 'Pause')
export const Play = icon(PhPlay, 'Play')
export const Plus = icon(PhPlus, 'Plus')
export const QrCode = icon(PhQrCode, 'QrCode')
export const ReceiptText = icon(PhReceipt, 'ReceiptText')
export const Redo2 = icon(PhArrowUUpRight, 'Redo2')
export const RefreshCw = icon(PhArrowsClockwise, 'RefreshCw')
export const Repeat2 = icon(PhRepeat, 'Repeat2')
export const Rocket = icon(PhRocketLaunch, 'Rocket')
export const RotateCcw = icon(PhArrowCounterClockwise, 'RotateCcw')
export const ScanSearch = icon(PhScan, 'ScanSearch')
export const Search = icon(PhMagnifyingGlass, 'Search')
export const Send = icon(PhPaperPlaneTilt, 'Send')
export const Settings = icon(PhGearSix, 'Settings')
export const Shapes = icon(PhShapes, 'Shapes')
export const Share = icon(PhExport, 'Share')
export const Shield = icon(PhShield, 'Shield')
export const ShieldCheck = icon(PhShieldCheck, 'ShieldCheck')
export const SlidersHorizontal = icon(PhSlidersHorizontal, 'SlidersHorizontal')
export const Smartphone = icon(PhDeviceMobile, 'Smartphone')
export const Sparkles = icon(PhSparkle, 'Sparkles')
export const Square = icon(PhSquare, 'Square')
export const SquarePlus = icon(PhPlusSquare, 'SquarePlus')
export const Store = icon(PhStorefront, 'Store')
export const Target = icon(PhTarget, 'Target')
export const Ticket = icon(PhTicket, 'Ticket')
export const Trash2 = icon(PhTrash, 'Trash2')
export const Trophy = icon(PhTrophy, 'Trophy')
export const Type = icon(PhTextT, 'Type')
export const Undo2 = icon(PhArrowUUpLeft, 'Undo2')
export const Upload = icon(PhUploadSimple, 'Upload')
export const UserCog = icon(PhUserGear, 'UserCog')
export const Users = icon(PhUsersThree, 'Users')
export const Wallet = icon(PhWallet, 'Wallet')
export const Wand2 = icon(PhMagicWand, 'Wand2')
export const WandSparkles = icon(PhMagicWand, 'WandSparkles')
export const Wrench = icon(PhWrench, 'Wrench')
export const X = icon(PhX, 'X')
export const XCircle = icon(PhXCircle, 'XCircle')
export const Zap = icon(PhLightning, 'Zap')
