// The GitHub Sponsors wall behind the landing page and the /sponsors table.
// Paid ad slots are a separate concern and live in ads.ts.
import sponsors from './sponsors'

export const GITHUB_SPONSORS_URL = 'https://github.com/sponsors/dinwwwh'
export const OPEN_COLLECTIVE_URL = 'https://opencollective.com/middleapi'

export function avatarSrc(src: string, px: number): string {
  const url = new URL(src)

  if (url.hostname === 'avatars.githubusercontent.com') {
    url.searchParams.set('s', String(px * 2))
  }
  else if (url.hostname === 'github.com') {
    url.searchParams.set('size', String(px * 2))
  }

  return url.href
}

export interface Sponsor {
  /** Display name, already falling back to the GitHub login when unset. */
  name: string
  login: string
  avatar: string
  /** Sponsor's own link, tracking params already baked in upstream. */
  link: string
  /** Extra rel tokens for the link (e.g. `sponsored`); may be empty. */
  rel: string
  /** GitHub Sponsors tier label, e.g. `Special Sponsor`. */
  tierTitle: string
  /** Higher is a bigger tier; `0` marks a lapsed sponsor. */
  tierLevel: number
  /** Amount in USD this month; `-1` once the sponsorship has ended. */
  amount: number
  createdAt: string
  type: string
}

export interface SponsorTier {
  title: string
  level: number
  total: number
  sponsors: Sponsor[]
}

// Annotated, not cast: if the sync script ever changes the generated shape this
// has to fail type checking rather than quietly lie about it.
const allSponsors: Sponsor[] = sponsors

/** Must match the README's split in scripts/sync-sponsors.ts, or counts disagree. */
function isActive(sponsor: Sponsor): boolean {
  return sponsor.tierLevel > 0 && sponsor.amount > 0
}

/**
 * Current sponsors grouped by tier, biggest tier first. The generated file is
 * already sorted, so grouping preserves that order within each tier.
 */
export function sponsorTiers(): SponsorTier[] {
  const tiers: SponsorTier[] = []

  for (const sponsor of allSponsors) {
    if (!isActive(sponsor)) {
      continue
    }

    const tier = tiers.at(-1)

    if (tier?.level === sponsor.tierLevel) {
      tier.sponsors.push(sponsor)
      tier.total += sponsor.amount
      continue
    }

    tiers.push({ title: sponsor.tierTitle, level: sponsor.tierLevel, total: sponsor.amount, sponsors: [sponsor] })
  }

  return tiers
}

/** Sponsors whose sponsorship has ended, still worth thanking. */
export function pastSponsors(): Sponsor[] {
  return allSponsors.filter(sponsor => !isActive(sponsor))
}
