import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ChartBarIcon, IdentificationCardIcon, MedalIcon } from '@phosphor-icons/react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { endpoints } from '@/api/endpoints'
import { useSession } from '@/session-context'
import { Notice } from '@/notice'

export function HomePage() {
  const { t } = useTranslation()
  const session = useSession()
  const [params] = useSearchParams()
  if (session.loading) return <Skeleton className="h-64 w-full rounded-3xl" />
  if (session.user) return <Navigate to={`/users/${session.user.id}`} replace />
  const features = [
    { icon: ChartBarIcon, title: t('home.scoresTitle'), text: t('home.scoresText') },
    { icon: MedalIcon, title: t('home.titlesTitle'), text: t('home.titlesText') },
    { icon: IdentificationCardIcon, title: t('home.plateTitle'), text: t('home.plateText') },
  ]
  return (
    <div className="space-y-6">
      {params.get('error') === 'sso' && <Notice>{t('home.signInFailed')}</Notice>}
      <Card className="rounded-3xl">
        <CardContent className="space-y-6 py-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('home.heading')}</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">{t('home.lead')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a className={buttonVariants({ size: 'lg' })} href={endpoints.login('/')}>
              {t('nav.signIn')}
            </a>
            <a
              className={buttonVariants({ size: 'lg', variant: 'outline' })}
              href={endpoints.account('register')}
            >
              {t('home.register')}
            </a>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="rounded-3xl">
            <CardContent className="space-y-2">
              <Icon className="size-6 text-red-500" aria-hidden="true" />
              <h2 className="font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
