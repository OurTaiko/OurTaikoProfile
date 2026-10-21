import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import type { Title } from '@/api/types'
import { Nameplate } from '@/components/nameplate'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Notice } from '@/notice'
import { titleName } from '@/dan'

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

// The catalog: every title there is, as it looks on a nameplate.
export function TitlesPage() {
  const { t, i18n } = useTranslation()
  const { titles, error } = useTitles()
  const language = i18n.resolvedLanguage ?? 'zh-Hans'
  return (
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
  )
}
