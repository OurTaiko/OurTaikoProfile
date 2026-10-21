import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowSquareOutIcon, CaretLeftIcon, CaretRightIcon, StarIcon } from '@phosphor-icons/react'
import { api, jsonRequest } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import type {
  Course,
  Dans,
  HeldTitle,
  Nameplate as Plate,
  PublicProfile,
  ScorePage,
  ScoreSort,
  ScoreView,
} from '@/api/types'
import { Nameplate } from '@/components/nameplate'
import { Crown } from '@/components/crown'
import { ChoiceSelect } from '@/components/choice-select'
import { UserAvatar } from '@/components/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Notice } from '@/notice'
import { useSession } from '@/session-context'
import { danName, danNames, titleName, verdictKey } from '@/dan'
import { formatLocale } from '@/i18n'
import { cn } from '@/lib/utils'

type Tab = 'scores' | 'titles' | 'dans'

export function UserPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const session = useSession()
  const [params, setParams] = useSearchParams()
  const tab = (
    ['scores', 'titles', 'dans'].includes(params.get('tab') ?? '') ? params.get('tab') : 'scores'
  ) as Tab
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [error, setError] = useState('')
  const mine = session.user?.id === id
  useEffect(() => {
    const controller = new AbortController()
    setProfile(null)
    setError('')
    api<PublicProfile>(endpoints.user(id), { signal: controller.signal })
      .then(setProfile)
      .catch((e) => !controller.signal.aborted && setError(e.message))
    return () => controller.abort()
  }, [id])
  if (error) return <Notice>{error}</Notice>
  if (!profile) return <Skeleton className="h-40 w-full rounded-3xl" />
  const plate = {
    ...profile.nameplate,
    nickname: profile.user.nickname,
    avatarUrl: profile.user.avatarUrl,
  }
  return (
    <div className="space-y-6">
      <Card className="rounded-3xl">
        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <UserAvatar
            nickname={profile.user.nickname || '?'}
            avatarUrl={profile.user.avatarUrl}
            className="size-20"
            fallbackClassName="text-2xl"
          />
          <div className="min-w-0 flex-1 space-y-3">
            <Nameplate plate={plate} />
            <p className="truncate font-mono text-xs text-muted-foreground">{id}</p>
            {!profile.profilesAvailable && (
              <Notice kind="info">{t('profile.accountCenterDown')}</Notice>
            )}
          </div>
        </CardContent>
      </Card>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setParams(value === 'scores' ? {} : { tab: String(value) }, { replace: true })
        }
        className="gap-5"
      >
        <TabsList aria-label={t('profile.sections')}>
          <TabsTrigger value="scores">{t('profile.tabs.scores')}</TabsTrigger>
          <TabsTrigger value="titles">{t('profile.tabs.titles')}</TabsTrigger>
          <TabsTrigger value="dans">{t('profile.tabs.dans')}</TabsTrigger>
        </TabsList>
        <TabsContent value="scores">
          <ScoresTab id={id} profile={profile} />
        </TabsContent>
        <TabsContent value="titles">
          <TitlesTab
            id={id}
            mine={mine}
            plate={plate}
            onPlate={(next) => setProfile({ ...profile, nameplate: next })}
          />
        </TabsContent>
        <TabsContent value="dans">
          <DansTab id={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

const courses: Course[] = ['Easy', 'Normal', 'Hard', 'Oni', 'Edit']

function ScoresTab({ id, profile }: { id: string; profile: PublicProfile }) {
  const { t, i18n } = useTranslation()
  const [view, setView] = useState<ScoreView>('best')
  const [sort, setSort] = useState<ScoreSort>('level')
  const [source, setSource] = useState('all')
  const [course, setCourse] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<ScorePage | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ view, sort, source, page: String(page) })
    if (course) query.set('course', course)
    setError('')
    api<ScorePage>(endpoints.userScores(id, query), { signal: controller.signal })
      .then(setResult)
      .catch((e) => !controller.signal.aborted && setError(e.message))
    return () => controller.abort()
  }, [id, view, sort, source, course, page])
  const language = i18n.resolvedLanguage ?? 'zh-Hans'
  const date = new Intl.DateTimeFormat(formatLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const sourceName = (sourceId: string) =>
    profile.sources.find((s) => s.id === sourceId)?.name ?? sourceId
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1
  return (
    <Card className="rounded-3xl">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={view}
            onValueChange={(value) => {
              const next = value as ScoreView
              setView(next)
              setSort(next === 'best' ? 'level' : 'recent')
              setPage(1)
            }}
          >
            <TabsList aria-label={t('scores.view')}>
              <TabsTrigger value="best">{t('scores.best')}</TabsTrigger>
              <TabsTrigger value="all">{t('scores.all')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <ChoiceSelect
            label={t('scores.source')}
            value={source}
            onValueChange={(value) => {
              setSource(value)
              setPage(1)
            }}
            items={[
              { value: 'all', label: t('scores.allSources') },
              ...profile.sources.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <ChoiceSelect
            label={t('scores.course')}
            value={course || 'all'}
            onValueChange={(value) => {
              setCourse(value === 'all' ? '' : value)
              setPage(1)
            }}
            items={[
              { value: 'all', label: t('scores.allCourses') },
              ...courses.map((c) => ({ value: c, label: t(`courses.${c}`) })),
            ]}
          />
          <ChoiceSelect
            label={t('scores.sort')}
            value={sort}
            onValueChange={(value) => {
              setSort(value as ScoreSort)
              setPage(1)
            }}
            items={(['level', 'score', 'recent'] as const).map((s) => ({
              value: s,
              label: t(`scores.sorts.${s}`),
            }))}
          />
        </div>
        {view === 'best' && <CardDescription>{t('scores.bestExplained')}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Notice>{error}</Notice>}
        {result?.sources
          .filter((s) => s.error || s.truncated)
          .map((s) => (
            <Notice key={s.id} kind={s.error ? 'error' : 'info'}>
              {s.error
                ? t('scores.sourceDown', { name: s.name })
                : t('scores.truncated', { name: s.name })}
            </Notice>
          ))}
        {!result ? (
          <Skeleton className="h-64 w-full" />
        ) : result.items.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{t('scores.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('scores.song')}</TableHead>
                  <TableHead>{t('scores.course')}</TableHead>
                  <TableHead className="text-right">{t('scores.score')}</TableHead>
                  <TableHead className="text-center">{t('scores.crown.title')}</TableHead>
                  <TableHead className="text-right">{t('scores.judgements')}</TableHead>
                  <TableHead className="text-right">{t('scores.maxCombo')}</TableHead>
                  {view === 'best' && (
                    <TableHead className="text-right">{t('scores.plays')}</TableHead>
                  )}
                  <TableHead>{t('scores.playedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((row) => (
                  <TableRow key={row.source + row.id}>
                    <TableCell className="max-w-72">
                      <div className="flex min-w-0 items-center gap-2">
                        {row.chartUrl ? (
                          <a
                            href={row.chartUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate font-medium hover:underline"
                          >
                            {row.titleTranslations?.[language] || row.title}
                          </a>
                        ) : (
                          <span className="truncate font-medium">
                            {row.titleTranslations?.[language] || row.title}
                          </span>
                        )}
                        {row.chartUrl && (
                          <ArrowSquareOutIcon
                            className="size-3.5 shrink-0 opacity-50"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline">{sourceName(row.source)}</Badge>
                        {!row.isLatest && (
                          <Badge variant="secondary">{t('scores.oldVersion')}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {t(`courses.${row.course}`)}
                      {row.side !== 'single' && (
                        <span className="text-muted-foreground"> · {row.side.toUpperCase()}</span>
                      )}
                      <span className="ml-2 inline-flex items-center gap-0.5 text-muted-foreground">
                        <StarIcon weight="fill" className="size-3" aria-hidden="true" />
                        {row.level}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      {row.score.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Crown
                        status={
                          view === 'best'
                            ? (row.bestClearStatus ?? row.ClearStatus)
                            : row.ClearStatus
                        }
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                      <span className="text-amber-600 dark:text-amber-400">{row.good}</span> /{' '}
                      <span>{row.ok}</span> /{' '}
                      <span className="text-sky-600 dark:text-sky-400">{row.bad}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.max_combo}
                    </TableCell>
                    {view === 'best' && (
                      <TableCell className="text-right tabular-nums">
                        {row.playCount ?? 1}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {date.format(new Date(row.submittedAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {result && pages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              aria-label={t('scores.previous')}
            >
              <CaretLeftIcon className="size-4" />
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              aria-label={t('scores.next')}
            >
              <CaretRightIcon className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TitlesTab({
  id,
  mine,
  plate,
  onPlate,
}: {
  id: string
  mine: boolean
  plate: Plate
  onPlate: (plate: Plate) => void
}) {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const [held, setHeld] = useState<HeldTitle[] | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    api<{ titles: HeldTitle[] }>(endpoints.userTitles(id), { signal: controller.signal })
      .then((r) => setHeld(r.titles))
      .catch((e) => !controller.signal.aborted && setError(e.message))
    return () => controller.abort()
  }, [id])
  const wear = async (titleId: string | null, showDan: boolean) => {
    setSaving(true)
    setError('')
    try {
      const next = await api<Plate>(
        endpoints.nameplate,
        jsonRequest('PUT', { titleId, showDan }, session.csrfToken),
      )
      onPlate({ ...next, nickname: plate.nickname, avatarUrl: plate.avatarUrl })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const language = i18n.resolvedLanguage ?? 'zh-Hans'
  const date = new Intl.DateTimeFormat(formatLocale(language), { dateStyle: 'medium' })
  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>{t('titles.held')}</CardTitle>
        <CardDescription>
          {mine ? t('titles.wearExplained') : t('titles.heldExplained')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Notice>{error}</Notice>}
        {mine && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={plate.showDan}
              disabled={saving}
              onCheckedChange={(checked) => void wear(plate.title?.id ?? null, Boolean(checked))}
            />
            {t('titles.showDan')}
          </label>
        )}
        {!held ? (
          <Skeleton className="h-32 w-full" />
        ) : held.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t('titles.none')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {held.map((h) => {
              const worn = plate.title?.id === h.title.id
              return (
                <li
                  key={h.title.id}
                  className={cn(
                    'space-y-3 rounded-2xl border p-4',
                    worn && 'border-primary ring-2 ring-primary/30',
                  )}
                >
                  <Nameplate
                    plate={{ ...plate, title: h.title, dan: null }}
                    className="h-16 [&_.text-2xl]:text-base"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={h.title.official ? 'default' : 'secondary'}>
                      {h.title.official ? t('titles.official') : t('titles.community')}
                    </Badge>
                    <span>{titleName(h.title, language)}</span>
                    <span>·</span>
                    <span>
                      {h.courseTitle || (h.service === 'admin' ? t('titles.byAdmin') : h.service)}
                    </span>
                    <span>·</span>
                    <span>{date.format(new Date(h.grantedAt))}</span>
                  </div>
                  {h.title.description && <p className="text-sm">{h.title.description}</p>}
                  {mine && (
                    <Button
                      size="sm"
                      variant={worn ? 'secondary' : 'default'}
                      disabled={saving}
                      onClick={() => void wear(worn ? null : h.title.id, plate.showDan)}
                    >
                      {worn ? t('titles.takeOff') : t('titles.wear')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {mine && (
          <p className="text-sm text-muted-foreground">
            <Link to="/titles" className="underline">
              {t('titles.catalogLink')}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function DansTab({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const [dans, setDans] = useState<Dans | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api<Dans>(endpoints.userDans(id), { signal: controller.signal })
      .then(setDans)
      .catch((e) => !controller.signal.aborted && setError(e.message))
    return () => controller.abort()
  }, [id])
  const date = new Intl.DateTimeFormat(formatLocale(i18n.resolvedLanguage), { dateStyle: 'medium' })
  if (error) return <Notice>{error}</Notice>
  if (!dans) return <Skeleton className="h-64 w-full rounded-3xl" />
  const byIndex = new Map(dans.badges.map((b) => [b.index, b]))
  return (
    <div className="space-y-6">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>{t('dans.badges')}</CardTitle>
          <CardDescription>{t('dans.badgesExplained')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-5 gap-2 sm:grid-cols-9 lg:grid-cols-13">
            {danNames.map((name, index) => {
              const badge = byIndex.get(index)
              return (
                <li
                  key={name}
                  title={badge ? t(verdictKey(badge.verdict)) : t('dans.notYet')}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-full border-2 text-xs font-bold',
                    !badge && 'border-dashed text-muted-foreground/60',
                    badge &&
                      !badge.gold &&
                      'border-red-200 bg-linear-to-b from-red-500 to-red-700 text-white',
                    badge?.gold &&
                      'border-amber-200 bg-linear-to-b from-amber-400 to-amber-600 text-white',
                  )}
                >
                  {name}
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>{t('dans.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {dans.history.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t('dans.noHistory')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dans.course')}</TableHead>
                  <TableHead>{t('dans.result')}</TableHead>
                  <TableHead>{t('dans.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dans.history.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <span className="font-medium">
                        {a.courseTitle || (a.dan !== null ? danName(a.dan) : '—')}
                      </span>
                      <Badge variant={a.official ? 'default' : 'secondary'} className="ml-2">
                        {a.official ? t('titles.official') : t('titles.community')}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        a.verdict === 0 && 'text-muted-foreground',
                        a.verdict >= 4 && 'text-amber-600 dark:text-amber-400',
                        a.verdict >= 1 && a.verdict <= 3 && 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {t(verdictKey(a.verdict))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {date.format(new Date(a.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
