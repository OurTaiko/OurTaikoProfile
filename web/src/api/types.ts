export type User = {
  id: string
  username: string
  nickname: string
  avatarUrl?: string
  preferredLanguage?: string
  isAdmin: boolean
}
export type Session = { user: User | null; csrfToken: string }

export type TitleStyle = 'wood' | 'teal' | 'wood2' | 'purple' | 'gold' | 'rainbow'
export type Title = {
  id: string
  name: string
  nameTranslations: Record<string, string>
  description: string
  style: TitleStyle
  official: boolean
  // The player who made it; null for the titles administrators keep.
  ownerId: string | null
}
export type DanBadge = { index: number; verdict: number; gold: boolean; achievedAt: string }
export type Nameplate = {
  userId: string
  nickname: string
  avatarUrl: string
  title: Title | null
  dan: DanBadge | null
  showDan: boolean
}
export type Source = { id: string; name: string; site: string }
export type PublicProfile = {
  user: { id: string; nickname: string; avatarUrl: string }
  nameplate: Nameplate
  sources: Source[]
  profilesAvailable: boolean
}

export type Course = 'Easy' | 'Normal' | 'Hard' | 'Oni' | 'Edit'
export type ScoreRow = {
  id: string
  songId: string | number
  course: Course
  side: 'single' | 'p1' | 'p2'
  good: number
  ok: number
  bad: number
  score: number
  drumroll: number
  max_combo: number
  ClearStatus: number
  isLatest: boolean
  submittedAt: string
  title: string
  titleTranslations: Record<string, string>
  level: number
  bestClearStatus?: number
  playCount?: number
  source: string
  chartUrl: string
}
export type ScoreView = 'best' | 'all'
export type ScoreSort = 'level' | 'score' | 'recent'
export type ScorePage = {
  items: ScoreRow[]
  total: number
  page: number
  pageSize: number
  view: ScoreView
  sort: ScoreSort
  sources: (Source & { count: number; truncated: boolean; error?: string })[]
}
export type HeldTitle = { title: Title; grantedAt: string; service: string; courseTitle: string }
export type AwardRecord = {
  service: string
  courseTitle: string
  official: boolean
  verdict: number
  dan: number | null
  createdAt: string
}
export type Dans = { badges: DanBadge[]; history: AwardRecord[] }
