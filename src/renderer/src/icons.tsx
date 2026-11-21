import {
  AppWindow, ArrowClockwise, ArrowSquareOut, CaretDown, Check, Clock, Copy, DotsSixVertical, Folder, GearSix, Lightning,
  ListBullets, MagnifyingGlass, Notebook, PaperPlaneRight, Pause, PencilSimple, Play, Plus, Pulse, PushPin, SidebarSimple,
  Sparkle, SquaresFour, Star, Stop, TerminalWindow, Trash, Tray, X, type Icon, type IconProps
} from '@phosphor-icons/react'

// Phosphor's duotone style: a line plus a soft fill in the current colour, so accents read purple.
const make = (Glyph: Icon) => {
  const Wrapped = (p: IconProps) => <Glyph size={16} weight="duotone" aria-hidden {...p} />
  Wrapped.displayName = Glyph.displayName
  return Wrapped
}

export const IconSend = make(PaperPlaneRight)
export const IconStop = make(Stop)
export const IconSettings = make(GearSix)
export const IconMemory = make(Notebook)
export const IconSkill = make(Lightning)
export const IconClock = make(Clock)
export const IconClose = make(X)
export const IconChevron = make(CaretDown)
export const IconFolder = make(Folder)
export const IconPlus = make(Plus)
export const IconPause = make(Pause)
export const IconPlay = make(Play)
export const IconCheck = make(Check)
export const IconGrip = make(DotsSixVertical)
export const IconTerminal = make(TerminalWindow)
export const IconSpark = make(Sparkle)
export const IconGrid = make(SquaresFour)
export const IconList = make(ListBullets)
export const IconExternal = make(ArrowSquareOut)
export const IconRefresh = make(ArrowClockwise)
export const IconTrash = make(Trash)
export const IconPin = make(PushPin)
export const IconEdit = make(PencilSimple)
export const IconInbox = make(Tray)
export const IconPulse = make(Pulse)
export const IconWindow = make(AppWindow)
export const IconCopy = make(Copy)
export const IconSearch = make(MagnifyingGlass)
export const IconStar = make(Star)
export const IconSidebar = make(SidebarSimple)
