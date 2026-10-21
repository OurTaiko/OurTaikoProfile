import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { api, jsonRequest } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import type { TitleStyle } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChoiceSelect } from '@/components/choice-select'
import { Nameplate } from '@/components/nameplate'
import { Notice } from '@/notice'
import { useSession } from '@/session-context'
import { useTitles } from './titles'

const styles: TitleStyle[] = ['wood', 'teal', 'wood2', 'purple', 'gold', 'rainbow']
const languages = ['en', 'ja', 'ko'] as const

// Administrators of the Profile application keep the title catalog and grant titles by hand.
export function AdminPage() {
  const { t } = useTranslation()
  const session = useSession()
  const { titles, error: loadError, reload } = useTitles()
  const [form, setForm] = useState({
    id: '',
    name: '',
    description: '',
    style: 'wood' as TitleStyle,
    official: true,
    en: '',
    ja: '',
    ko: '',
  })
  const [grant, setGrant] = useState({ userId: '', titleId: '' })
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  if (session.loading) return null
  if (!session.user?.isAdmin) return <Navigate to="/" replace />
  const run = async (work: () => Promise<unknown>, done: string) => {
    setMessage(null)
    try {
      await work()
      setMessage({ kind: 'info', text: done })
      reload()
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    const nameTranslations = Object.fromEntries(
      languages.filter((l) => form[l].trim()).map((l) => [l, form[l].trim()]),
    )
    void run(
      () =>
        api(
          endpoints.adminTitle(form.id.trim()),
          jsonRequest(
            'PUT',
            {
              name: form.name,
              nameTranslations,
              description: form.description,
              style: form.style,
              official: form.official,
            },
            session.csrfToken,
          ),
        ),
      t('admin.saved'),
    )
  }
  const send = (method: 'POST' | 'DELETE') => (event: FormEvent) => {
    event.preventDefault()
    void run(
      () => api(endpoints.adminGrants, jsonRequest(method, grant, session.csrfToken)),
      method === 'POST' ? t('admin.granted') : t('admin.revoked'),
    )
  }
  return (
    <div className="space-y-6">
      {(message || loadError) && (
        <Notice kind={message?.kind ?? 'error'}>{message?.text ?? loadError}</Notice>
      )}
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>{t('admin.editTitle')}</CardTitle>
          <CardDescription>{t('admin.editTitleExplained')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
            <div className="space-y-2">
              <Label htmlFor="title-id">{t('admin.id')}</Label>
              <Input
                id="title-id"
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                placeholder="taiko-master"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title-name">{t('admin.name')}</Label>
              <Input
                id="title-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={40}
                required
              />
            </div>
            {languages.map((language) => (
              <div className="space-y-2" key={language}>
                <Label htmlFor={`title-${language}`}>
                  {t('admin.nameIn', { language: t(`languages.${language}`) })}
                </Label>
                <Input
                  id={`title-${language}`}
                  value={form[language]}
                  onChange={(e) => setForm({ ...form, [language]: e.target.value })}
                  maxLength={40}
                />
              </div>
            ))}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title-description">{t('admin.description')}</Label>
              <Input
                id="title-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={500}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <ChoiceSelect
                label={t('admin.style')}
                value={form.style}
                onValueChange={(value) => setForm({ ...form, style: value as TitleStyle })}
                items={styles.map((s) => ({ value: s, label: t(`admin.styles.${s}`) }))}
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.official}
                  onCheckedChange={(checked) => setForm({ ...form, official: Boolean(checked) })}
                />
                {t('admin.official')}
              </label>
            </div>
            <div className="sm:col-span-2">
              <Nameplate
                plate={{
                  userId: '',
                  nickname: session.user.nickname,
                  avatarUrl: '',
                  dan: null,
                  showDan: false,
                  title: {
                    id: form.id,
                    name: form.name || '—',
                    nameTranslations: {},
                    description: '',
                    style: form.style,
                    official: form.official,
                  },
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{t('admin.save')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>{t('admin.catalog')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {titles?.map((title) => (
              <li key={title.id} className="flex flex-wrap items-center gap-3 py-3">
                <code className="text-xs">{title.id}</code>
                <span className="font-medium">{title.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`admin.styles.${title.style}`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {title.official ? t('titles.official') : t('titles.community')}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm({
                        id: title.id,
                        name: title.name,
                        description: title.description,
                        style: title.style,
                        official: title.official,
                        en: title.nameTranslations.en ?? '',
                        ja: title.nameTranslations.ja ?? '',
                        ko: title.nameTranslations.ko ?? '',
                      })
                    }
                  >
                    {t('admin.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm(t('admin.confirmDelete', { id: title.id })))
                        void run(
                          () =>
                            api(endpoints.adminTitle(title.id), {
                              ...jsonRequest('DELETE', {}, session.csrfToken),
                            }),
                          t('admin.deleted'),
                        )
                    }}
                  >
                    {t('admin.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>{t('admin.grant')}</CardTitle>
          <CardDescription>{t('admin.grantExplained')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={send('POST')}>
            <div className="space-y-2">
              <Label htmlFor="grant-user">{t('admin.userId')}</Label>
              <Input
                id="grant-user"
                className="w-80 font-mono"
                value={grant.userId}
                onChange={(e) => setGrant({ ...grant, userId: e.target.value.trim() })}
                required
              />
            </div>
            <ChoiceSelect
              label={t('admin.title')}
              value={grant.titleId}
              onValueChange={(value) => setGrant({ ...grant, titleId: value })}
              items={(titles ?? []).map((title) => ({
                value: title.id,
                label: `${title.name} (${title.id})`,
              }))}
            />
            <Button type="submit" disabled={!grant.titleId}>
              {t('admin.grantButton')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!grant.titleId}
              onClick={(e) => send('DELETE')(e)}
            >
              {t('admin.revokeButton')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
