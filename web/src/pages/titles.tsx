import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, jsonRequest } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import type { Title, TitleStyle } from '@/api/types'
import { ChoiceSelect } from '@/components/choice-select'
import { Nameplate } from '@/components/nameplate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Notice } from '@/notice'
import { useSession } from '@/session-context'
import { titleName } from '@/dan'

export const titleStyles: TitleStyle[] = ['wood', 'teal', 'wood2', 'purple', 'gold', 'rainbow']
// Rainbow and purple are kept for official titles.
const communityStyles: TitleStyle[] = ['wood', 'teal', 'wood2', 'gold']
// A player keeps at most this many community titles (official ones do not count).
const titleLimit = 5
const languages = ['en', 'ja', 'ko'] as const

export function useTitles() {
  const [titles, setTitles] = useState<Title[] | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api<{ titles: Title[] }>(endpoints.titles, { signal: controller.signal })
      .then((r) => setTitles(r.titles))
      .catch((e) => !controller.signal.aborted && setError(e.message))
    return () => controller.abort()
  }, [revision])
  return { titles, error, reload: () => setRevision((r) => r + 1) }
}

type Draft = {
  id: string | null
  official: boolean
  name: string
  description: string
  style: TitleStyle
  en: string
  ja: string
  ko: string
}
const emptyDraft: Draft = {
  id: null,
  official: false,
  name: '',
  description: '',
  style: 'wood',
  en: '',
  ja: '',
  ko: '',
}

// The titles the player made for their own 段位 courses: up to five community ones, which they
// change or delete; of the ones an administrator made official they change the band only.
function MyTitles({ titles, reload }: { titles: Title[]; reload: () => void }) {
  const { t } = useTranslation()
  const session = useSession()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const user = session.user
  if (!user) return null
  const mine = titles.filter((title) => title.ownerId === user.id)
  const community = mine.filter((title) => !title.official).length
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await work()
      setMessage({ kind: 'info', text: done })
      setDraft(emptyDraft)
      reload()
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    const nameTranslations = Object.fromEntries(
      languages.filter((l) => draft[l].trim()).map((l) => [l, draft[l].trim()]),
    )
    const body = {
      name: draft.name,
      nameTranslations,
      description: draft.description,
      style: draft.style,
    }
    void run(
      () =>
        api(
          draft.id ? endpoints.myTitle(draft.id) : endpoints.myTitles,
          jsonRequest(draft.id ? 'PUT' : 'POST', body, session.csrfToken),
        ),
      t('titles.saved'),
    )
  }
  const editing = draft.id !== null
  const full = !editing && community >= titleLimit
  const styles = draft.official ? titleStyles : communityStyles
  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>{t('titles.mine')}</CardTitle>
        <CardDescription>{t('titles.mineExplained', { limit: titleLimit })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        <p className="text-sm text-muted-foreground" data-testid="title-quota">
          {t('titles.quota', { used: community, limit: titleLimit })}
        </p>
        {mine.length > 0 && (
          <ul className="divide-y rounded-2xl border">
            {mine.map((title) => (
              <li key={title.id} className="flex flex-wrap items-center gap-3 p-3">
                <Nameplate
                  plate={{
                    userId: user.id,
                    nickname: user.nickname,
                    avatarUrl: '',
                    title,
                    dan: null,
                    showDan: false,
                  }}
                  className="h-16 max-w-xs [&_.text-2xl]:text-lg"
                />
                <Badge variant={title.official ? 'default' : 'secondary'}>
                  {title.official ? t('titles.official') : t('titles.community')}
                </Badge>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setMessage(null)
                      setDraft({
                        id: title.id,
                        official: title.official,
                        name: title.name,
                        description: title.description,
                        style: title.style,
                        en: title.nameTranslations.en ?? '',
                        ja: title.nameTranslations.ja ?? '',
                        ko: title.nameTranslations.ko ?? '',
                      })
                    }}
                  >
                    {title.official ? t('titles.changeBand') : t('titles.edit')}
                  </Button>
                  {!title.official && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(t('titles.confirmDelete', { name: title.name })))
                          void run(
                            () =>
                              api(endpoints.myTitle(title.id), {
                                ...jsonRequest('DELETE', {}, session.csrfToken),
                              }),
                            t('titles.deleted'),
                          )
                      }}
                    >
                      {t('titles.delete')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <form className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-2" onSubmit={save}>
          <h3 className="font-semibold sm:col-span-2">
            {editing ? t('titles.editing') : t('titles.create')}
          </h3>
          {draft.official && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t('titles.officialBandOnly')}
            </p>
          )}
          {full && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t('titles.limitReached', { limit: titleLimit })}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="my-title-name">{t('admin.name')}</Label>
            <Input
              id="my-title-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              maxLength={40}
              disabled={draft.official || full}
              required
            />
          </div>
          {languages.map((language) => (
            <div className="space-y-2" key={language}>
              <Label htmlFor={`my-title-${language}`}>
                {t('admin.nameIn', { language: t(`languages.${language}`) })}
              </Label>
              <Input
                id={`my-title-${language}`}
                value={draft[language]}
                onChange={(e) => setDraft({ ...draft, [language]: e.target.value })}
                maxLength={40}
                disabled={draft.official || full}
              />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="my-title-description">{t('admin.description')}</Label>
            <Input
              id="my-title-description"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              maxLength={500}
              disabled={draft.official || full}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <ChoiceSelect
              label={t('admin.style')}
              value={draft.style}
              onValueChange={(value) => setDraft({ ...draft, style: value as TitleStyle })}
              items={styles.map((s) => ({ value: s, label: t(`admin.styles.${s}`) }))}
              disabled={full}
            />
            {!draft.official && (
              <span className="text-xs text-muted-foreground">{t('titles.keptStyles')}</span>
            )}
          </div>
          <div className="sm:col-span-2">
            <Nameplate
              plate={{
                userId: user.id,
                nickname: user.nickname,
                avatarUrl: '',
                dan: null,
                showDan: false,
                title: {
                  id: draft.id ?? '',
                  name: draft.name || '—',
                  nameTranslations: {},
                  description: '',
                  style: draft.style,
                  official: draft.official,
                  ownerId: user.id,
                },
              }}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy || full}>
              {editing ? t('titles.save') : t('titles.createButton')}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => setDraft(emptyDraft)}>
                {t('titles.cancel')}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// The catalog: every title there is, as it looks on a nameplate. Signed in, the player's own
// titles come first.
export function TitlesPage() {
  const { t, i18n } = useTranslation()
  const { titles, error, reload } = useTitles()
  const language = i18n.resolvedLanguage ?? 'zh-Hans'
  return (
    <div className="space-y-6">
      {titles && <MyTitles titles={titles} reload={reload} />}
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>{t('titles.catalog')}</CardTitle>
          <CardDescription>{t('titles.catalogExplained')}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <Notice>{error}</Notice>}
          {!titles ? (
            <Skeleton className="h-48 w-full" />
          ) : titles.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t('titles.catalogEmpty')}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {titles.map((title) => (
                <li key={title.id} className="space-y-2 rounded-2xl border p-4">
                  <Nameplate
                    plate={{
                      userId: '',
                      nickname: titleName(title, language),
                      avatarUrl: '',
                      title,
                      dan: null,
                      showDan: false,
                    }}
                    className="h-16 [&_.text-2xl]:hidden"
                  />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={title.official ? 'default' : 'secondary'}>
                      {title.official ? t('titles.official') : t('titles.community')}
                    </Badge>
                    <code>{title.id}</code>
                  </div>
                  {title.description && <p className="text-sm">{title.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
