import { useTranslation } from 'react-i18next'
import { CrownSimpleIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

// ClearStatus: 0 none, 1 cleared (silver), 2 full combo (gold), 3 all good (rainbow).
export function Crown({ status }: { status: number }) {
  const { t } = useTranslation()
  if (status < 1 || status > 3) return <span className="text-muted-foreground">—</span>
  const label = t(
    (['scores.crown.clear', 'scores.crown.fullCombo', 'scores.crown.allGood'] as const)[status - 1],
  )
  return (
    <span title={label} aria-label={label} className="inline-flex">
      <CrownSimpleIcon
        weight="fill"
        className={cn(
          'size-5',
          status === 1 && 'text-zinc-400',
          status === 2 && 'text-amber-500',
          status === 3 && 'text-fuchsia-500',
        )}
      />
    </span>
  )
}
