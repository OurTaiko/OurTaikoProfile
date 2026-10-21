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
