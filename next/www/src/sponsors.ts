import list from '../sponsors.json' with { type: 'json' };

/**
 * The sponsor tiers, by the least a sponsor gives a month (across KATT and
 * the trpc organization), highest first.
 */
export const sponsorTiers = [
  { label: 'Gold', minMonthlyDollars: 1000, tier: 'gold' },
  { label: 'Silver', minMonthlyDollars: 500, tier: 'silver' },
  { label: 'Bronze', minMonthlyDollars: 250, tier: 'bronze' },
] as const;

export type SponsorTier = (typeof sponsorTiers)[number]['tier'];

/** The tiers whose sponsors the site features as partners. */
export const partnerTiers: ReadonlyArray<SponsorTier> = ['gold', 'silver'];

/** The tier of a sponsor who gives `monthlyDollars` a month, if any. */
export function tierFor(monthlyDollars: number): SponsorTier | undefined {
  return sponsorTiers.find((tier) => monthlyDollars >= tier.minMonthlyDollars)
    ?.tier;
}

const isSponsorTier = (tier: unknown): tier is SponsorTier =>
  sponsorTiers.some((entry) => entry.tier === tier);

/** A sponsor, as `build/sponsors-sync.ts` writes them to `sponsors.json`. */
export interface Sponsor {
  /** When they started, in ms since the epoch. */
  readonly createdAt: number;
  readonly imgSrc: string;
  readonly link: string;
  readonly login: string;
  readonly name: string;
  /**
   * A tiered sponsor's place among the tiered sponsors: by what they give a
   * month, then by what they've given in all; 1 is first.
   */
  readonly rank?: number;
  /** Their tier, by what they give a month now; absent below the lowest. */
  readonly tier?: SponsorTier;
  /** How much they've given, relative to the others: 1 to about 100. */
  readonly weight: number;
}

const entries: ReadonlyArray<
  Omit<Sponsor, 'tier'> & { readonly tier?: string }
> = list;

/** Every sponsor, in the order they started. */
export const sponsors: ReadonlyArray<Sponsor> = entries.map(
  ({ tier, ...sponsor }) =>
    isSponsorTier(tier) ? { ...sponsor, tier } : sponsor,
);

/** The sponsors who have given the most, most first. */
export const topSponsors = sponsors
  .toSorted((a, b) => b.weight - a.weight)
  .slice(0, 5);

export const sponsorUrl = 'https://github.com/sponsors/trpc';

/** Sponsoring the trpc organization at the tier GitHub numbers `tierId`. */
export const sponsorTierUrl = (tierId: number) =>
  `${sponsorUrl}/sponsorships?tier_id=${tierId}`;

/** `/sponsor`, the tiers and what partners get; trpc.io's `/pricing` redirects there. */
export const sponsorPage = {
  description:
    'tRPC is MIT licensed and kept going by its sponsors. Silver and Gold sponsors are partners, featured across the site and the README.',
  /** The hero's heading, and its social card's. */
  headline: 'Keep tRPC typesafe, fast and free',
  path: '/sponsor',
  title: 'Sponsor tRPC',
} as const;

/** `sponsor`'s GitHub avatar, `size` pixels square. */
export function avatarUrl(sponsor: Sponsor, size: number) {
  const url = new URL(sponsor.imgSrc);
  url.searchParams.set('s', String(size));
  return url.toString();
}

/**
 * What the site says about partners it has drawn a logo for
 * (`components/sponsors/partner-logos.tsx`); a partner without an entry
 * shows their avatar and name.
 */
const partnerDetails: Partial<
  Record<
    string,
    { readonly accent: string; readonly blurb: string; readonly domain: string }
  >
> = {
  coderabbitai: {
    accent: '#FF570A',
    blurb: 'AI code reviews on every pull request, with fixes in one click.',
    domain: 'coderabbit.ai',
  },
  greptileai: {
    accent: '#28E99F',
    blurb: 'AI code review that understands your whole codebase.',
    domain: 'greptile.com',
  },
  SerpApi: {
    accent: '#6F62EC',
    blurb: 'Search engine results from Google and others, through one API.',
    domain: 'serpapi.com',
  },
};

export interface Partner extends Sponsor {
  /** The brand's color, for the card's glow. */
  readonly accent: string;
  readonly blurb: string;
  readonly domain: string;
  readonly tier: SponsorTier;
}

const hostOf = (link: string) =>
  URL.canParse(link) ? new URL(link).hostname.replace(/^www\./, '') : link;

/**
 * The sponsors in the partner tiers (silver and up), by rank. One who drops
 * below silver, or stops sponsoring, drops out with the next sync of
 * `sponsors.json`.
 */
export const partners: ReadonlyArray<Partner> = sponsors
  .flatMap((sponsor): Array<Partner> => {
    const tier = sponsor.tier;
    if (tier === undefined || !partnerTiers.includes(tier)) {
      return [];
    }
    const details = partnerDetails[sponsor.login] ?? {
      accent: '#888888',
      blurb: sponsor.name,
      domain: hostOf(sponsor.link),
    };
    return [{ ...sponsor, ...details, tier }];
  })
  .toSorted(
    (a, b) =>
      (a.rank ?? Number.POSITIVE_INFINITY) -
        (b.rank ?? Number.POSITIVE_INFINITY) || b.weight - a.weight,
  );

/** Under the headline on `/sponsor`'s social card (`build/og-image.ts`). */
export const sponsorCardLede = `MIT licensed, and kept going by ${sponsors.length} sponsors.`;

/** `/sponsor`'s social card's alt text: what the card says. */
export const sponsorCardAlt = [
  `${sponsorPage.title}: ${sponsorPage.headline}.`,
  sponsorCardLede,
  ...(partners.length === 0
    ? []
    : [
        `Partners: ${new Intl.ListFormat('en').format(partners.map((partner) => partner.name))}.`,
      ]),
].join(' ');
