import list from '../sponsors.json' with { type: 'json' };

/** A sponsor, as `build/sponsors-sync.ts` writes them to `sponsors.json`. */
export interface Sponsor {
  /** When they started, in ms since the epoch. */
  readonly createdAt: number;
  readonly imgSrc: string;
  readonly link: string;
  readonly login: string;
  readonly name: string;
  /** How much they've given, relative to the others: 1 to about 100. */
  readonly weight: number;
}

/** Every sponsor, in the order they started. */
export const sponsors: ReadonlyArray<Sponsor> = list;

/** The sponsors who have given the most, most first. */
export const topSponsors = sponsors
  .toSorted((a, b) => b.weight - a.weight)
  .slice(0, 5);

export const sponsorUrl = 'https://github.com/sponsors/trpc';

/** `sponsor`'s GitHub avatar, `size` pixels square. */
export function avatarUrl(sponsor: Sponsor, size: number) {
  const url = new URL(sponsor.imgSrc);
  url.searchParams.set('s', String(size));
  return url.toString();
}

/**
 * The sponsors featured as partners, with what the site says about them;
 * the README lists them as its top tier too (`build/sponsors-readme.ts`).
 * One who stops sponsoring drops out with the next sync of `sponsors.json`.
 */
const partnerDetails = {
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
} as const;

export type PartnerLogin = keyof typeof partnerDetails;

export const partnerLogins: ReadonlyArray<string> = Object.keys(partnerDetails);

export interface Partner extends Sponsor {
  /** The brand's color, for the card's glow. */
  readonly accent: string;
  readonly blurb: string;
  readonly domain: string;
  readonly login: PartnerLogin;
}

const isPartnerLogin = (login: string): login is PartnerLogin =>
  Object.hasOwn(partnerDetails, login);

/** The partners who still sponsor, who have given the most first. */
export const partners: ReadonlyArray<Partner> = sponsors
  .toSorted((a, b) => b.weight - a.weight)
  .flatMap((sponsor) => {
    const login = sponsor.login;
    return isPartnerLogin(login)
      ? [{ ...sponsor, ...partnerDetails[login], login }]
      : [];
  });
