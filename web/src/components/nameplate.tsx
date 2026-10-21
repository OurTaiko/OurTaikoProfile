import { useTranslation } from 'react-i18next'
import type { Nameplate as Plate, TitleStyle } from '@/api/types'
import { danName, titleName } from '@/dan'
import { cn } from '@/lib/utils'

// The title bands of the game's nameplate (frame_top 0–4 and the rainbow band).
const bands: Record<TitleStyle, string> = {
  wood: 'bg-linear-to-b from-[#a8743f] to-[#6e4420]',
  teal: 'bg-linear-to-b from-[#3fb6b2] to-[#1d6f73]',
  wood2: 'bg-linear-to-b from-[#d6a46a] to-[#9a6430]',
  purple: 'bg-linear-to-b from-[#9b6ad6] to-[#5b2f93]',
  gold: 'bg-linear-to-b from-[#f7d774] to-[#b8860b]',
  rainbow:
    'bg-[linear-gradient(90deg,#ff5f6d,#ffc371,#fff66d,#6dff9c,#5fc8ff,#a06dff,#ff5f6d)] bg-[length:200%_100%] motion-safe:animate-[nameplate-rainbow_6s_linear_infinite]',
}

// The nameplate as the game draws it: the 段位 chip on the left, the title band over the name.
// Without title or 段位 it is the plain guest plate.
export function Nameplate({ plate, className }: { plate: Plate; className?: string }) {
  const { t, i18n } = useTranslation()
  const name = plate.nickname || t('profile.unknownPlayer')
  return (
    <div
      className={cn(
        'relative flex h-24 w-full max-w-md items-stretch overflow-hidden rounded-2xl border border-black/10 bg-linear-to-b from-[#fdfbf7] to-[#e9e2d5] shadow-sm dark:border-white/10 dark:from-[#3a342c] dark:to-[#26221d]',
        className,
      )}
      data-testid="nameplate"
    >
      {plate.dan && (
        <div className="flex w-20 shrink-0 items-center justify-center">
          <div
            className={cn(
              'flex size-16 items-center justify-center rounded-full border-4 text-lg font-black tracking-tight text-white shadow-inner',
              plate.dan.gold
                ? 'border-amber-200 bg-linear-to-b from-amber-400 to-amber-600'
                : 'border-red-200 bg-linear-to-b from-red-500 to-red-700',
            )}
            title={danName(plate.dan.index)}
          >
            {danName(plate.dan.index)}
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4">
        {plate.title && (
          <div
            className={cn(
              'w-fit max-w-full truncate rounded-md px-3 py-0.5 text-sm font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]',
              bands[plate.title.style],
            )}
          >
            {titleName(plate.title, i18n.resolvedLanguage ?? 'zh-Hans')}
          </div>
        )}
        <div className="truncate text-2xl font-bold tracking-tight">{name}</div>
      </div>
    </div>
  )
}
