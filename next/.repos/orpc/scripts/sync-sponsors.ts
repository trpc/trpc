import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

interface Sponsor {
  name: string | null
  login: string
  avatar: string
  amount: number
  type: string
  createdAt: string
  tierTitle: string
  tierTitlePlural: string
  tierLevel: number
  /** Extra rel tokens for the sponsor's link (e.g. `sponsored`); may be empty. */
  rel: string
  link: string
  /** Tagline, present on sponsors that bought an ad slot. */
  description?: string
  /** Brand tint behind the ad card, both themes required together. */
  background?: { light: string, dark: string }
  /** 1-based ad-grid position the sponsor bought. */
  slot?: number
  [key: string]: unknown
}

const SPONSORS_SOURCE_URL = 'https://raw.githubusercontent.com/middleapi/static/refs/heads/main/sponsors.json'
const SPONSORS_OUTPUT_FILE = 'apps/content/sponsors/sponsors.ts'
const SLOTS_OUTPUT_FILE = 'apps/content/sponsors/slots.ts'
const PAST_SPONSORS_URL = 'https://orpc.dev/sponsors#past-sponsors'
const ROOT_DIR = process.cwd()
const README_FILE_NAME = 'README.md'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.output', '.next', '.nuxt', '.turbo'])

async function findReadmes(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const result: string[] = []
  const subdirPromises: Promise<string[]>[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue
      }

      subdirPromises.push(findReadmes(fullPath))
    }
    else if (entry.isFile() && entry.name === README_FILE_NAME) {
      result.push(fullPath)
    }
  }

  const subResults = await Promise.all(subdirPromises)
  return result.concat(...subResults)
}

/** `noopener` always, plus whatever extra tokens the data carries. */
function relAttribute(sponsor: Sponsor): string {
  return ['noopener', sponsor.rel].filter(Boolean).join(' ')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function getTierImageSizeAndColumns(tierLevel: number, tierLevels: number[]): [columns: number, imageSize: number] {
  const rank = tierLevels.findIndex(level => level === tierLevel)

  const columnByRank = [3, 4, 5, 6, 7, 8]
  const column = columnByRank[Math.min(rank, columnByRank.length - 1)] ?? 3
  return [column, Math.floor(838 / column)]
}

/**
 * The slot sponsors' cards, mirroring the docs ad cards — logo on the left,
 * name over tagline on the right — but without the brand backgrounds (GitHub
 * strips inline styles anyway). One card per row. The oversized cell width is
 * a preferred width, not a minimum: GitHub caps tables at the container, so
 * the card spans the full row on any screen and the text wraps on phones
 * instead of scrolling. One cell per card, the logo floated with the
 * deprecated-but-sanitizer-safe `align`/`hspace` attributes, so no table
 * border cuts through the card.
 */
function buildSlotCards(slotSponsors: Sponsor[]): string[] {
  const lines = ['<table>']

  for (const sponsor of slotSponsors) {
    const name = escapeHtml(sponsor.name ?? sponsor.login)
    const description = escapeHtml(sponsor.description ?? '')

    lines.push('  <tr>')
    lines.push(`   <td width="2000"><a href="${escapeHtml(sponsor.link)}" target="_blank" rel="${relAttribute(sponsor)}" title="${description}"><img src="${escapeHtml(sponsor.avatar)}" width="64" align="left" hspace="12" alt="${name}"/><b>${name}</b></a><br /><sub>${description}</sub></td>`)
    lines.push('  </tr>')
  }

  lines.push('</table>')
  lines.push('')

  return lines
}

function buildSponsorsSection(sponsors: Sponsor[]): string {
  const activeSponsors = sponsors.filter(sponsor => sponsor.tierLevel > 0 && sponsor.amount > 0)
  const pastSponsors = sponsors.filter(sponsor => sponsor.tierLevel <= 0 || sponsor.amount <= 0)

  // Slot sponsors are featured as cards up top; the tier tables below carry
  // everyone else so nobody appears twice.
  const slotSponsors = activeSponsors
    .filter(sponsor => sponsor.slot !== undefined)
    .sort((a, b) => a.slot! - b.slot!)
  const tieredSponsors = activeSponsors.filter(sponsor => sponsor.slot === undefined)

  const groupedSponsors = new Map<number, Sponsor[]>()

  for (const sponsor of tieredSponsors) {
    const group = groupedSponsors.get(sponsor.tierLevel)

    if (group) {
      group.push(sponsor)
      continue
    }

    groupedSponsors.set(sponsor.tierLevel, [sponsor])
  }

  const lines = [
    '## Sponsors',
    '',
    'Like what we build over at [middleapi](https://github.com/middleapi)? You can help keep it going through [GitHub Sponsors](https://github.com/sponsors/dinwwwh) or [Open Collective](https://opencollective.com/middleapi). Every bit helps! 🚀',
    '',
  ]

  if (slotSponsors.length > 0) {
    lines.push(...buildSlotCards(slotSponsors))
  }

  // Sizes rank against every active tier, slot sponsors' tiers included, so
  // featuring the top tiers as cards does not inflate the tables below them.
  const sizeTierLevels = [...new Set(activeSponsors.map(sponsor => sponsor.tierLevel))].sort((a, b) => b - a)
  const tierLevels = [...groupedSponsors.keys()].sort((a, b) => b - a)

  for (const tierLevel of tierLevels) {
    const tierSponsors = groupedSponsors.get(tierLevel)

    if (!tierSponsors || tierSponsors.length === 0) {
      continue
    }

    const tierTitle = tierSponsors[0]?.tierTitlePlural ?? `Tier ${tierLevel}`
    const [columns, imageSize] = getTierImageSizeAndColumns(tierLevel, sizeTierLevels)

    lines.push(`### ${tierTitle}`)
    lines.push('')
    lines.push('<table>')
    lines.push('  <tr>')

    for (const [index, sponsor] of tierSponsors.entries()) {
      const href = sponsor.link
      const displayName = sponsor.name ?? sponsor.login
      const escapedName = escapeHtml(displayName)

      lines.push(`   <td align="center"><a href="${escapeHtml(href)}" target="_blank" rel="${relAttribute(sponsor)}" title="${escapedName}"><img src="${escapeHtml(sponsor.avatar)}" width="${imageSize}" alt="${escapedName}"/><br />${escapedName}</a></td>`)

      const isRowEnd = (index + 1) % columns === 0
      const isLast = index === tierSponsors.length - 1

      if (isRowEnd && !isLast) {
        lines.push('  </tr>')
        lines.push('  <tr>')
      }
    }

    lines.push('  </tr>')
    lines.push('</table>')
    lines.push('')
  }

  if (pastSponsors.length > 0) {
    const noun = pastSponsors.length === 1 ? 'past sponsor' : 'past sponsors'

    lines.push(`With thanks to [${pastSponsors.length} ${noun}](${PAST_SPONSORS_URL}) who helped get oRPC here.`)
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

function replaceSponsorsSection(content: string, replacement: string): string {
  const heading = '## Sponsors'
  const startIndex = content.indexOf(heading)

  if (startIndex === -1) {
    return content
  }

  const nextHeadingIndex = content.indexOf('\n## ', startIndex + heading.length)
  const endIndex = nextHeadingIndex === -1 ? content.length : nextHeadingIndex + 1

  // Trimmed to a single trailing newline, or a section replaced at the end of
  // the file leaves a blank last line that eslint's markdown fixer removes —
  // and the next sync would put back, forever.
  return `${`${content.slice(0, startIndex)}${replacement}${content.slice(endIndex)}`.trimEnd()}\n`
}

function generatedModule(entries: unknown): string {
  return [
    '/* eslint-disable eslint-comments/no-unlimited-disable */',
    '/* eslint-disable */',
    `// Generated by scripts/sync-sponsors.ts from ${SPONSORS_SOURCE_URL} — do not edit.`,
    '',
    // eslint-disable-next-line ban/ban
    `export default ${JSON.stringify(entries, null, 2)}`,
    '',
  ].join('\n')
}

/**
 * Emit the sponsor list the docs site renders (the landing page's sponsor
 * wall and the /sponsors table). Only the fields the site draws are kept, and
 * the order is fully determined by the data — highest tier first, then largest
 * amount, then longest-running — so re-running the sync produces a minimal
 * diff.
 */
async function writeSponsorsData(sponsors: Sponsor[]): Promise<void> {
  const entries = [...sponsors]
    .sort((a, b) =>
      b.tierLevel - a.tierLevel
      || b.amount - a.amount
      || a.createdAt.localeCompare(b.createdAt)
      || a.login.localeCompare(b.login),
    )
    .map(sponsor => ({
      name: sponsor.name ?? sponsor.login,
      login: sponsor.login,
      avatar: sponsor.avatar,
      link: sponsor.link,
      rel: sponsor.rel,
      tierTitle: sponsor.tierTitle,
      tierLevel: sponsor.tierLevel,
      amount: sponsor.amount,
      createdAt: sponsor.createdAt,
      type: sponsor.type,
    }))

  await writeFile(path.join(ROOT_DIR, SPONSORS_OUTPUT_FILE), generatedModule(entries))
  console.log(`Wrote ${entries.length} sponsors to ${SPONSORS_OUTPUT_FILE}.`)
}

/**
 * Emit the ad-slot inventory (sponsors carrying a `slot` position), shaped for
 * apps/content/sponsors/ads.ts. Kept apart from sponsors.ts because the slot
 * rotation script ships to the browser and the sponsor wall's data has no
 * business in that bundle.
 */
async function writeSlotsData(sponsors: Sponsor[]): Promise<void> {
  const entries = sponsors
    .filter(sponsor => sponsor.slot !== undefined && sponsor.tierLevel > 0 && sponsor.amount > 0)
    .sort((a, b) => a.slot! - b.slot!)
    .map(sponsor => ({
      position: sponsor.slot!,
      name: sponsor.name ?? sponsor.login,
      description: sponsor.description ?? '',
      logo: sponsor.avatar,
      href: sponsor.link,
      rel: sponsor.rel,
      // JSON.stringify drops it when absent.
      background: sponsor.background,
    }))

  await writeFile(path.join(ROOT_DIR, SLOTS_OUTPUT_FILE), generatedModule(entries))
  console.log(`Wrote ${entries.length} ad slots to ${SLOTS_OUTPUT_FILE}.`)
}

async function main(): Promise<void> {
  const response = await fetch(SPONSORS_SOURCE_URL)

  if (!response.ok) {
    throw new Error(`Failed to fetch sponsors data: ${response.status} ${response.statusText}`)
  }

  // Links arrive with their tracking params already baked in upstream.
  const sponsors = await response.json() as Sponsor[]
  const readmeFiles = await findReadmes(ROOT_DIR)
  const replacement = buildSponsorsSection(sponsors)

  await writeSponsorsData(sponsors)
  await writeSlotsData(sponsors)

  const readmeContents = await Promise.all(
    readmeFiles.map(readmePath => readFile(readmePath, 'utf8')),
  )

  const writePromises: Promise<void>[] = []
  let updatedCount = 0

  for (const [i, content] of readmeContents.entries()) {
    const nextContent = replaceSponsorsSection(content, replacement)

    if (nextContent !== content) {
      writePromises.push(writeFile(readmeFiles[i]!, nextContent))
      updatedCount += 1
    }
  }

  await Promise.all(writePromises)
  console.log(`Updated sponsors section in ${updatedCount} README files.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
