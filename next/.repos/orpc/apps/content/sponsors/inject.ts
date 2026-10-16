import { readFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const WORDS_PER_AD = 300
export const EXTRA_WORDS_AFTER_GRID_AD = 100
export const MAX_ADS_PER_PAGE = 4
export const SLOT_TAG = '<SponsorSlot />'
export const GRID_SLOT_TAG = '<SponsorSlot grid />'

/**
 * Insert `<SponsorSlot />` tags into MDX source. One simple rule: walk the
 * page accumulating words (code blocks count; fences are tracked only so a
 * `##` inside one is ignored), and place a slot right before a `##` heading
 * whenever it is the page's first heading or at least a gap's worth of words
 * has passed since the last slot, resetting the count. If the trailing
 * content also clears the bar — or the page never triggered at all — one
 * more slot goes at the end. Frontmatter is left untouched.
 *
 * The gap is `WORDS_PER_AD`, widened to an even `total / MAX_ADS_PER_PAGE`
 * once a page is long enough to blow past the cap, so a long page spreads its
 * slots down the whole page instead of front-loading them at one every
 * `WORDS_PER_AD` and running dry after the opening sections. Either way at
 * most `MAX_ADS_PER_PAGE` slots land on a page.
 *
 * Wherever the page's first slot lands it gets the `grid` variant, which lists
 * every position at once; the rest stay two-cell rotating slots. Since that
 * one slot already carries every sponsor, the run behind it never closes
 * before `WORDS_PER_AD + EXTRA_WORDS_AFTER_GRID_AD` words, which only binds
 * on pages short enough to still be using the unwidened gap.
 */
export function injectSlots(source: string): string {
  const lines = source.split('\n')

  let bodyStart = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
    if (end !== -1) {
      bodyStart = end + 1
    }
  }

  const countWords = (text: string) => text.match(/\S+/g)?.length ?? 0
  const gap = Math.max(WORDS_PER_AD, countWords(lines.slice(bodyStart).join('\n')) / MAX_ADS_PER_PAGE)
  const gridGap = Math.max(gap, WORDS_PER_AD + EXTRA_WORDS_AFTER_GRID_AD)
  const gapAfter = (placed: number) => placed === 0 ? 0 : placed === 1 ? gridGap : gap

  let inFence = false
  let words = 0
  const insertBefore: number[] = []
  for (let i = bodyStart; i < lines.length && insertBefore.length < MAX_ADS_PER_PAGE; i++) {
    const trimmed = lines[i]!.trim()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
    }
    else if (!inFence && /^##\s/.test(trimmed) && words >= gapAfter(insertBefore.length)) {
      insertBefore.push(i)
      words = 0
    }
    words += countWords(trimmed)
  }

  // Splice bottom-up so earlier indices stay valid.
  for (let i = insertBefore.length - 1; i >= 0; i--) {
    lines.splice(insertBefore[i]!, 0, '', i === 0 ? GRID_SLOT_TAG : SLOT_TAG, '')
  }
  if (insertBefore.length < MAX_ADS_PER_PAGE && words >= gapAfter(insertBefore.length)) {
    lines.push('', insertBefore.length === 0 ? GRID_SLOT_TAG : SLOT_TAG, '')
  }

  return lines.join('\n')
}

const contentDirs = ['docs', 'blog'].map(
  dir => join(dirname(fileURLToPath(import.meta.url)), '..', dir) + sep,
)

/**
 * Vite plugin that rewrites docs/blog MDX at load time (before Blume's MDX
 * compiler runs), so authored sources on disk stay clean.
 */
export function sponsorAdsInjectPlugin() {
  return {
    name: 'sponsors-inject',
    enforce: 'pre' as const,
    async load(id: string) {
      const path = id.split('?')[0]!
      if (!path.endsWith('.mdx') || !contentDirs.some(dir => path.startsWith(dir))) {
        return null
      }
      return injectSlots(await readFile(path, 'utf-8'))
    },
  }
}
