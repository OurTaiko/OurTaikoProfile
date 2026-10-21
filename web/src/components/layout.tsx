import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  IdentificationCardIcon,
  MedalIcon,
  ShieldStarIcon,
  SignInIcon,
  SignOutIcon,
  GearIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { useSession } from '@/session-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { UserAvatar } from '@/components/user-avatar'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/theme'
import { Notice } from '@/notice'
import { endpoints } from '@/api/endpoints'
import pageBackground from '@/assets/page-background.webp'

export function Layout() {
  const { t } = useTranslation()
  const session = useSession()
  const { pathname, search } = useLocation()
  const [error, setError] = useState('')
  const links = [
    ...(session.user
      ? [{ to: `/users/${session.user.id}`, label: t('nav.myPage'), icon: IdentificationCardIcon }]
      : []),
    { to: '/titles', label: t('nav.titles'), icon: MedalIcon },
    ...(session.user?.isAdmin
      ? [{ to: '/admin', label: t('nav.admin'), icon: ShieldStarIcon }]
      : []),
  ]
  return (
    <div className="isolate relative min-h-svh bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <img
          src={pageBackground}
          alt=""
          className="absolute inset-0 size-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-linear-to-b from-background/55 via-background/75 to-background/95 dark:from-background/80 dark:via-background/90 dark:to-background/95" />
      </div>
      <header className="sticky top-0 z-30 border-b bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex shrink-0 items-baseline gap-2 tracking-tight" to="/">
            <span className="bg-linear-to-r from-red-500 via-red-400 to-orange-400 bg-clip-text text-lg font-bold text-transparent">
              OurTaiko
            </span>
            <span className="hidden text-base font-normal text-muted-foreground sm:inline">
              Profile
            </span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto" aria-label={t('nav.main')}>
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' }))
                }
              >
                <Icon className="size-4 opacity-60" aria-hidden="true" />
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {session.loading ? (
              <span className="text-xs text-muted-foreground">{t('nav.connecting')}</span>
            ) : session.user ? (
              <>
                <Link
                  className="flex max-w-40 items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  to={`/users/${session.user.id}`}
                >
                  <UserAvatar
                    nickname={session.user.nickname ?? ''}
                    avatarUrl={session.user.avatarUrl}
                  />
                  <span className="hidden truncate text-sm lg:block" data-testid="account-nickname">
                    {session.user.nickname}
                  </span>
                </Link>
                <a
                  className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                  href={endpoints.account('profile')}
                  aria-label={t('nav.accountCenter')}
                  title={t('nav.accountCenter')}
                >
                  <GearIcon className="size-4" aria-hidden="true" />
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('nav.signOut')}
                  title={t('nav.signOut')}
                  onClick={() => {
                    setError('')
                    void session.logout().catch((e) => setError(e.message))
                  }}
                >
                  <SignOutIcon className="size-4" aria-hidden="true" />
                </Button>
              </>
            ) : (
              <a
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                href={endpoints.login(pathname + search)}
              >
                <SignInIcon className="size-4 opacity-60" aria-hidden="true" />
                {t('nav.signIn')}
              </a>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {(session.error || error) && <Notice>{session.error || error}</Notice>}
        <Outlet />
      </main>
    </div>
  )
}
