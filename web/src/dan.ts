import ringSilver from './assets/dan-ring-silver.png'
import ringGold from './assets/dan-ring-gold.png'
import ringRainbow from './assets/dan-ring-rainbow.png'

// The 25 段位 the game and Profile number 0 初級 .. 24 達人 (DanCourse.DanIndex). Their
// names stay Japanese in every language, as in the game.
export const danNames = [
  '初級',
  '十級',
  '九級',
  '八級',
  '七級',
  '六級',
  '五級',
  '四級',
  '三級',
  '二級',
  '一級',
  '初段',
  '二段',
  '三段',
  '四段',
  '五段',
  '六段',
  '七段',
  '八段',
  '九段',
  '十段',
  '玄人',
  '名人',
  '超人',
  '達人',
] as const

export const danName = (index: number) => danNames[index] ?? '—'
// The game offers 五級 (6) .. 達人 (24); 0–5 exist in the numbering only.
export const danFirst = 6
export const offeredDans = danNames
  .map((name, index) => ({ name, index }))
  .filter((d) => d.index >= danFirst)

// The emblem's ring by the pass's combo (DanBadge.combo): the game's 銀粋 / 金粋 / 虹粋 art
// (72x40 cells), drawn under the rank's name; its text by the pass line.
export const danRings = {
  0: `bg-[url(${ringSilver})] bg-contain bg-center bg-no-repeat`,
  1: `bg-[url(${ringGold})] bg-contain bg-center bg-no-repeat`,
  2: `bg-[url(${ringRainbow})] bg-contain bg-center bg-no-repeat`,
} as const
export const danText = (gold: boolean) =>
  gold
    ? 'text-[#ffd84a] [-webkit-text-stroke:0.5px_#5a3d00] [text-shadow:0_1px_1px_rgb(0_0_0/0.7)]'
    : 'text-white [-webkit-text-stroke:0.5px_#222] [text-shadow:0_1px_1px_rgb(0_0_0/0.7)]'

// verdict 1–3 red pass, 4–6 gold; within each, plain, full combo, all good.
const verdictKeys = [
  'dans.verdict.failed',
  'dans.verdict.red',
  'dans.verdict.redFullCombo',
  'dans.verdict.redAllGood',
  'dans.verdict.gold',
  'dans.verdict.goldFullCombo',
  'dans.verdict.goldAllGood',
] as const
export const verdictKey = (verdict: number) =>
  verdictKeys[verdict >= 1 && verdict <= 6 ? verdict : 0]

// The title text in the page's language, else its own name.
export function titleName(
  title: { name: string; nameTranslations: Record<string, string> },
  language: string,
) {
  return title.nameTranslations?.[language] || title.name
}
