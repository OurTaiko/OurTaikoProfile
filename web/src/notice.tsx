import type { ReactNode } from 'react'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export function Notice({
  children,
  kind = 'error',
}: {
  children: ReactNode
  kind?: 'error' | 'info'
}) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm',
        kind === 'error'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-card/70 text-muted-foreground',
      )}
    >
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
