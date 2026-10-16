/**
 * Headline numbers for the landing page, read at build time from the same
 * public sources the README badges use. Every lookup is bounded by a timeout,
 * retried a couple of times, memoized for the process, and resolves to `null`
 * on any failure, so a stat drops out of the row instead of hanging or breaking
 * the build.
 */

export interface Stat {
  value: string
  label: string
  href: string
}

const NPM_PACKAGE = '@orpc/client'

/** Long enough for a slow-but-alive host, short enough not to stall a build. */
const REQUEST_TIMEOUT_MS = 5000

/** codecov in particular answers 503 often enough to be worth a retry. */
const MAX_ATTEMPTS = 3

// Whichever rounding loses more digits wins, so both magnitudes stay readable:
// 979,155 renders as "979K" rather than "979.2K", and 5,460 as "5.5K".
const compact = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  maximumSignificantDigits: 3,
  notation: 'compact',
  roundingPriority: 'lessPrecision',
})

/** One request per URL per build; `blume dev` re-renders the page constantly. */
const cache = new Map<string, Promise<unknown>>()

async function load(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (response.ok) {
        return await response.json()
      }
    }
    catch {
      // Fall through to the retry.
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 400 * (attempt + 1))
      })
    }
  }

  // Loud enough to notice in a build log, quiet enough not to fail the build.
  console.warn(`[landing] stat source unreachable, dropping it: ${url}`)
  return null
}

function readJson(url: string): Promise<unknown> {
  const existing = cache.get(url)

  if (existing) {
    return existing
  }

  const promise = load(url)
  cache.set(url, promise)
  return promise
}

async function weeklyDownloads(): Promise<string | null> {
  const data = await readJson(
    `https://api.npmjs.org/downloads/point/last-week/${NPM_PACKAGE}`,
  ) as { downloads?: unknown } | null

  return typeof data?.downloads === 'number' ? compact.format(data.downloads) : null
}

async function coverage(): Promise<string | null> {
  const data = await readJson(
    'https://codecov.io/api/v2/github/middleapi/repos/orpc/',
  ) as { totals?: { coverage?: unknown } } | null

  const value = data?.totals?.coverage

  if (typeof value !== 'number') {
    return null
  }

  // Truncated, not rounded: 99.94 reads as "99.9%", not the "100%" codecov's
  // own badge rounds it to.
  return `${(Math.floor(value * 10) / 10).toFixed(1).replace(/\.0$/u, '')}%`
}

/**
 * Star count, shared with the hero's GitHub button so the page never shows two
 * differently-rounded versions of the same number.
 */
export async function githubStars(): Promise<string | null> {
  const data = await readJson(
    'https://api.github.com/repos/middleapi/orpc',
  ) as { stargazers_count?: unknown } | null

  return typeof data?.stargazers_count === 'number'
    ? compact.format(data.stargazers_count)
    : null
}

export async function landingStats(): Promise<Stat[]> {
  const [downloads, covered, starred] = await Promise.all([
    weeklyDownloads(),
    coverage(),
    githubStars(),
  ])

  return [
    ...(downloads
      ? [{
          value: downloads,
          label: 'Downloads each week',
          href: `https://www.npmjs.com/package/${NPM_PACKAGE}`,
        }]
      : []),
    ...(covered
      ? [{
          value: covered,
          label: 'Test coverage',
          href: 'https://codecov.io/gh/middleapi/orpc',
        }]
      : []),
    ...(starred
      ? [{
          value: starred,
          label: 'GitHub stars',
          href: 'https://github.com/middleapi/orpc',
        }]
      : []),
    {
      // Bundle size lives in the comparison section instead, where it has
      // tRPC's number next to it for contrast.
      value: 'MIT',
      label: 'Licensed, free forever',
      href: 'https://github.com/middleapi/orpc/blob/main/LICENSE',
    },
  ]
}
