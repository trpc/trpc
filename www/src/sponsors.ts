import list from '../sponsors.json' with { type: 'json' };

import type { CardFooter, SponsorCard } from './og/card.ts';

/**
 * The sponsor tiers, by the least a sponsor gives a month in dollars
 * (across KATT and the trpc organization on GitHub, and trpc on Open
 * Collective), highest first.
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

/** What every sponsor in `sponsors.json` has, wherever they sponsor. */
interface SponsorFields {
  /** When they started, in ms since the epoch. */
  readonly createdAt: number;
  readonly imgSrc: string;
  /** Their website, else their GitHub or Open Collective profile. */
  readonly link: string;
  readonly name: string;
  /**
   * A tiered sponsor's place among the tiered sponsors: by what they give a
   * month, then by what they've given in all; 1 is first.
   */
  readonly rank?: number;
  /** Their tier, by what they give a month now; absent below the lowest. */
  readonly tier?: SponsorTier;
  /**
   * How much they've given, relative to the others, from 5 to 100: a
   * floor plus their share of the top sponsor's total (`weightFor`).
   */
  readonly weight: number;
  /**
   * A small sponsor whose avatar didn't load at the last sync
   * (`build/sponsors-sync.ts`). The site leaves them out where it draws
   * small sponsors, rather than draw a broken image.
   */
  readonly imageless?: true;
}

/**
 * Someone known by their GitHub account: a GitHub sponsor (who may back on
 * Open Collective too), or one who pays directly (`sponsorsConfig`).
 */
export interface GithubSponsor extends SponsorFields {
  readonly source: 'github';
  readonly login: string;
}

/** Someone who backs trpc on Open Collective and not on GitHub. */
export interface OpenCollectiveSponsor extends SponsorFields {
  readonly source: 'opencollective';
  readonly slug: string;
  /** `https://opencollective.com/<slug>`. */
  readonly profileUrl: string;
}

/** A sponsor, as `build/sponsors-sync.ts` writes them to `sponsors.json`. */
export type Sponsor = GithubSponsor | OpenCollectiveSponsor;

/** Who a sponsor is, on GitHub or Open Collective. */
export type SponsorIdentity =
  | Pick<GithubSponsor, 'login' | 'source'>
  | Pick<OpenCollectiveSponsor, 'profileUrl' | 'slug' | 'source'>;

/** `sponsor`'s key, unique among the sponsors whatever their source. */
export function sponsorKey(sponsor: SponsorIdentity) {
  switch (sponsor.source) {
    case 'github':
      return `github/${sponsor.login}`;
    case 'opencollective':
      return `opencollective/${sponsor.slug}`;
  }
}

/** `sponsor`'s GitHub or Open Collective profile. */
export function profileUrl(sponsor: SponsorIdentity) {
  switch (sponsor.source) {
    case 'github':
      return `https://github.com/${sponsor.login}`;
    case 'opencollective':
      return sponsor.profileUrl;
  }
}

/** A sponsor below the partner tiers: bronze, or no tier at all. */
export const isSmallSponsor = (sponsor: Pick<Sponsor, 'tier'>) =>
  sponsor.tier === undefined || !partnerTiers.includes(sponsor.tier);

/** An entry of `sponsors.json`, as TypeScript reads JSON: strings, not literals. */
type Entry = Omit<SponsorFields, 'tier'> & {
  readonly login?: string;
  readonly profileUrl?: string;
  readonly slug?: string;
  readonly source: string;
  readonly tier?: string;
};

const entries: ReadonlyArray<Entry> = list;

function fromEntry({
  login,
  profileUrl,
  slug,
  source,
  tier,
  ...fields
}: Entry): Array<Sponsor> {
  const shared = isSponsorTier(tier) ? { ...fields, tier } : fields;
  if (source === 'github' && login !== undefined) {
    return [{ source, login, ...shared }];
  }
  if (
    source === 'opencollective' &&
    slug !== undefined &&
    profileUrl !== undefined
  ) {
    return [{ source, slug, profileUrl, ...shared }];
  }
  return [];
}

/** Every sponsor, in the order they started. */
export const sponsors: ReadonlyArray<Sponsor> = entries.flatMap(fromEntry);

/** Every sponsor the site draws: all but the imageless. */
export const drawnSponsors = sponsors.filter(
  (sponsor) => sponsor.imageless !== true,
);

/**
 * Who has given more first: by weight, then, as `sponsors.json` keeps no
 * totals, sponsors whose weights tie by tier rank, then by who started first.
 */
export const byMostGiven = (a: Sponsor, b: Sponsor) =>
  b.weight - a.weight ||
  (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY) ||
  a.createdAt - b.createdAt ||
  sponsorKey(a).localeCompare(sponsorKey(b));

/** The sponsors who have given the most, most first. */
export const topSponsors = drawnSponsors.toSorted(byMostGiven).slice(0, 5);

export const sponsorUrl = 'https://github.com/sponsors/trpc';

/** Sponsoring the trpc organization at the tier GitHub numbers `tierId`. */
export const sponsorTierUrl = (tierId: number) =>
  `${sponsorUrl}/sponsorships?tier_id=${tierId}`;

/** `/sponsor`, the tiers and what partners get; trpc.io's `/pricing` redirects there. */
export const sponsorPage = {
  /** The id of the sponsor cloud's heading, which the READMEs' cloud links to. */
  cloudId: 'sponsors',
  description:
    'tRPC is MIT licensed and kept going by its sponsors. Silver and Gold sponsors are partners, featured across the site and the README.',
  /** The hero's heading, and its social card's. */
  headline: 'Keep tRPC typesafe, fast and free',
  path: '/sponsor',
  title: 'Sponsor tRPC',
} as const;

/** `sponsor`'s GitHub or Open Collective avatar, `size` pixels square. */
export function avatarUrl(sponsor: Sponsor, size: number) {
  const url = new URL(sponsor.imgSrc);
  switch (sponsor.source) {
    case 'github':
      url.searchParams.set('s', String(size));
      break;
    case 'opencollective':
      url.searchParams.set('height', String(size));
      break;
  }
  return url.toString();
}

/**
 * What the site says about partners it has drawn a logo for
 * (`components/sponsors/partner-logos.tsx`), by `sponsorKey`; a partner
 * without an entry shows their avatar and name.
 */
const partnerDetails: Partial<
  Record<
    string,
    { readonly accent: string; readonly blurb: string; readonly domain: string }
  >
> = {
  'github/coderabbitai': {
    accent: '#FF570A',
    blurb: 'AI code reviews on every pull request, with fixes in one click.',
    domain: 'coderabbit.ai',
  },
  'github/greptileai': {
    accent: '#28E99F',
    blurb: 'AI code review that understands your whole codebase.',
    domain: 'greptile.com',
  },
  'github/SerpApi': {
    accent: '#6F62EC',
    blurb: 'Search engine results from Google and others, through one API.',
    domain: 'serpapi.com',
  },
};

export type Partner = Sponsor & {
  /** The brand's color, for the card's glow. */
  readonly accent: string;
  readonly blurb: string;
  readonly domain: string;
  readonly tier: SponsorTier;
};

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
    const details = partnerDetails[sponsorKey(sponsor)] ?? {
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

/** Under the headline on `/sponsor`'s social card (`og/card.ts`). */
const cardLede = (count: number) =>
  `MIT licensed, and kept going by ${count} sponsors.`;

export const sponsorCardLede = cardLede(sponsors.length);

/** As many partners and other sponsors as fit on the card's two rows. */
const cardPartners = 4;
const cardBackers = 12;

const tierLabel = (tier: SponsorTier) =>
  sponsorTiers.find((entry) => entry.tier === tier)?.label ?? tier;

const tierOrder = (tier: SponsorTier) =>
  sponsorTiers.findIndex((entry) => entry.tier === tier);

/** `ranked` partners, gold first, then each lower tier, by rank within a tier. */
const byTier = (ranked: ReadonlyArray<Partner>) =>
  ranked.toSorted((a, b) => tierOrder(a.tier) - tierOrder(b.tier));

/** The partners in the order the social cards name them (`cardFooterOf`). */
export const partnersByTier = byTier(partners);

/** As many other sponsors' faces as a card's foot draws at most. */
const footerFaces = 12;

/**
 * What every social card but `/sponsor`'s names along its foot
 * (`og/card.ts`), from `ranked` partners and `all` the sponsors: every
 * partner, gold first, then each lower tier, by rank within a tier; and the
 * other drawn sponsors by what they've given, twice as many as it draws
 * faces of.
 */
export function cardFooterOf(
  ranked: ReadonlyArray<Partner>,
  all: ReadonlyArray<Sponsor>,
): CardFooter {
  return {
    backers: all
      .filter(
        (sponsor) =>
          sponsor.imageless !== true &&
          !ranked.some((p) => sponsorKey(p) === sponsorKey(sponsor)),
      )
      .toSorted(byMostGiven)
      .slice(0, footerFaces * 2)
      // The faces are small; GitHub sends a big avatar for every face otherwise.
      .map((sponsor) => ({
        image: avatarUrl(sponsor, 68),
        name: sponsor.name,
      })),
    faceSlots: footerFaces,
    partners: byTier(ranked).map((partner) => ({
      image: partner.imgSrc,
      name: partner.name,
    })),
    sponsorCount: all.length,
  };
}

export const cardFooter = cardFooterOf(partners, sponsors);

/**
 * `/sponsor`'s social card, from `ranked` partners and `all` the sponsors:
 * the partners, gold first, then each lower tier, by rank within a tier;
 * then the other sponsors' avatars by what they've given, and a count of
 * the ones it doesn't draw. It gets twice as many others as fit, and draws
 * the first whose avatars load (`og/card.ts`).
 */
export function sponsorCardOf(
  ranked: ReadonlyArray<Partner>,
  all: ReadonlyArray<Sponsor>,
): SponsorCard {
  const ordered = byTier(ranked);
  const shown = ordered.slice(0, cardPartners);
  const backers = [
    ...ordered.slice(cardPartners).map((partner) => ({
      image: partner.imgSrc,
      name: partner.name,
      partner: true as const,
    })),
    ...all
      .filter(
        (sponsor) =>
          sponsor.imageless !== true &&
          !ranked.some((p) => sponsorKey(p) === sponsorKey(sponsor)),
      )
      .toSorted(byMostGiven)
      .map((sponsor) => ({ image: sponsor.imgSrc, name: sponsor.name })),
  ].slice(0, cardBackers * 2);
  return {
    backerSlots: cardBackers,
    backers,
    description: cardLede(all.length),
    kind: 'sponsor',
    partners: shown.map((partner) => ({
      image: partner.imgSrc,
      name: partner.name,
      tier: tierLabel(partner.tier),
    })),
    path: sponsorPage.path,
    sponsorCount: all.length,
    title: sponsorPage.headline,
    url: sponsorUrl,
  };
}

export const sponsorCard = sponsorCardOf(partners, sponsors);

/** `/sponsor`'s social card's alt text: what the card says. */
export const sponsorCardAlt = [
  `${sponsorPage.title}: ${sponsorPage.headline}.`,
  sponsorCardLede,
  ...(partners.length === 0
    ? []
    : [
        `Partners: ${new Intl.ListFormat('en').format(partnersByTier.map((partner) => partner.name))}.`,
      ]),
  `Sponsor at ${sponsorUrl.replace(/^https:\/\//, '')}.`,
].join(' ');
