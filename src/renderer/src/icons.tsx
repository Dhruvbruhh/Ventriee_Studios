import {
  AppWindow, ArrowClockwise, ArrowSquareOut, CaretDown, ChartBar, Check, Clock, Coins, Copy, Cpu, Database, DotsSixVertical, Folder,
  GearSix, Key, Lightning, ListBullets, ListChecks, MagnifyingGlass, Notebook, PaperPlaneRight, Pause, PencilSimple, Play,
  Plug, Plus, Pulse, PushPin, SidebarSimple, SignOut, SlidersHorizontal, Sparkle, SquaresFour, Star, Stop, TerminalWindow,
  Trash, Tray, UsersThree, X, Briefcase, Books, FlowArrow, Microphone, Palette, GithubLogo, Globe, PuzzlePiece, CloudArrowUp, Storefront, Question, type Icon, type IconProps
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
export const IconUsers = make(UsersThree)
export const IconTasks = make(ListChecks)
export const IconCoins = make(Coins)
export const IconPlug = make(Plug)
export const IconDatabase = make(Database)
export const IconSliders = make(SlidersHorizontal)
export const IconKey = make(Key)
export const IconCpu = make(Cpu)
export const IconSignOut = make(SignOut)
export const IconBriefcase = make(Briefcase)
export const IconBooks = make(Books)
export const IconChartBar = make(ChartBar)
export const IconFlow = make(FlowArrow)
export const IconMic = make(Microphone)
export const IconPalette = make(Palette)
export const IconGithub = make(GithubLogo)
export const IconGlobe = make(Globe)
export const IconPuzzle = make(PuzzlePiece)
export const IconCloud = make(CloudArrowUp)
export const IconStore = make(Storefront)
export const IconHelp = make(Question)
