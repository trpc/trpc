/**
 * The sponsor list the site and the README show, from what GitHub reports
 * (`sponsors-github.ts`), who backs trpc on Open Collective
 * (`sponsors-opencollective.ts`) and the sponsors who pay some other way. A
 * sponsor's weight is what they've paid in all, relative to whoever paid
 * the most: the cloud draws areas by it, and the hero and the README order
 * by it.
 */
import { Order } from 'effect';

import { type Sponsor, tierFor } from '../src/sponsors.ts';
import type { LifetimeValue, Sponsorship } from './sponsors-github.ts';
import type { OpenCollectiveBacker } from './sponsors-opencollective.ts';

/** Someone who sponsors outside GitHub Sponsors, paying up front. */
export interface DirectSponsor {
  readonly avatarUrl: string;
  /** What they pay at the start of each period. */
  readonly dollars: number;
  readonly every: 'month' | 'year';
  /** Their GitHub login, which their GitHub sponsorship would have too. */
  readonly login: string;
  readonly name: string;
  /** When they started, as `YYYY-MM-DD`. */
  readonly since: string;
  readonly websiteUrl: string;
}

/** Money GitHub doesn't attribute to a sponsor's account. */
export interface ExtraPayment {
  readonly dollars: number;
  readonly login: string;
  readonly why: string;
}

export interface SponsorsConfig {
  readonly direct: ReadonlyArray<DirectSponsor>;
  readonly extra: ReadonlyArray<ExtraPayment>;
  /** Private sponsors who said they can be shown. */
  readonly shownPrivately: ReadonlyArray<string>;
}

const dayMs = 24 * 60 * 60 * 1000;
const periodMs: Record<DirectSponsor['every'], number> = {
  month: 30 * dayMs,
  year: 365 * dayMs,
};

/** The weight of whoever paid the most. */
export const maxWeight = 100;

/**
 * `website` with trpc's referral and UTM parameters, the way sponsors'
 * links have always been tracked (a `ref` they set is kept), or
 * `undefined` when it isn't a URL.
 */
export function trackingLink(website: string) {
  const withScheme = /^https?:\/\//i.test(website)
    ? website
    : `https://${website}`;
  if (!URL.canParse(withScheme)) {
    return undefined;
  }
  const url = new URL(withScheme);
  if (!url.searchParams.has('ref')) {
    url.searchParams.set('ref', 'trpc');
  }
  url.searchParams.set('utm_source', 'github');
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', 'trpc');
  return url.toString();
}

/** What a direct sponsor has paid by `now`: every period they've started. */
export function directDollars(sponsor: DirectSponsor, now: number) {
  const periods = Math.max(
    1,
    Math.ceil((now - Date.parse(sponsor.since)) / periodMs[sponsor.every]),
  );
  return periods * sponsor.dollars;
}

/** `website`'s host (without `www.`) and path, to tell whether two are one site. */
function siteOf(website: string) {
  const withScheme = /^https?:\/\//i.test(website)
    ? website
    : `https://${website}`;
  if (!URL.canParse(withScheme)) {
    return undefined;
  }
  const url = new URL(withScheme);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return `${host}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
}

/**
 * Whether an Open Collective backer is `sponsor`, who sponsors on GitHub:
 * their profile links `sponsor`'s GitHub account, or they have the same
 * website.
 */
export function isSameSponsor(
  backer: Pick<OpenCollectiveBacker, 'githubLogin' | 'websiteUrl'>,
  sponsor: { readonly login: string; readonly websiteUrl: string | null },
) {
  if (backer.githubLogin?.toLowerCase() === sponsor.login.toLowerCase()) {
    return true;
  }
  const site =
    backer.websiteUrl === null ? undefined : siteOf(backer.websiteUrl);
  return (
    site !== undefined &&
    sponsor.websiteUrl !== null &&
    site === siteOf(sponsor.websiteUrl)
  );
}

interface Tally {
  avatarUrl: string;
  createdAt: number;
  dollars: number;
  login: string;
  monthlyDollars: number;
  name: string;
  /** Where they link to without a website. */
  profileUrl: string;
  websiteUrl: string | null;
}

/**
 * The sponsors to show, in the order they started (then by login, so the
 * file only changes when the sponsors do).
 *
 * Someone sponsoring several of the accounts is one sponsor, from when
 * they first started. What they're worth is what GitHub says they've paid
 * the accounts in all; a new sponsor GitHub hasn't charged yet counts their
 * monthly tier. Open Collective backers count the same way, in dollars, if
 * they back trpc now; one who sponsors on GitHub too (`isSameSponsor`) is
 * one sponsor, worth both, with what they give a month on each added up
 * for their tier. One who doesn't goes by the GitHub login their profile
 * links, else their Open Collective slug. Direct sponsors count every
 * period they've started, and `extra` is added on top.
 */
export function sponsorsList(opts: {
  readonly config: SponsorsConfig;
  readonly lifetimeValues: ReadonlyArray<LifetimeValue>;
  readonly now: number;
  readonly openCollective?: ReadonlyArray<OpenCollectiveBacker>;
  readonly sponsorships: ReadonlyArray<Sponsorship>;
}): Array<Sponsor> {
  const shownPrivately = new Set(opts.config.shownPrivately);
  const paidCents = new Map<string, number>();
  for (const value of opts.lifetimeValues) {
    paidCents.set(value.login, (paidCents.get(value.login) ?? 0) + value.cents);
  }

  const tallies = new Map<string, Tally>();
  for (const sponsorship of opts.sponsorships) {
    if (!sponsorship.isPublic && !shownPrivately.has(sponsorship.login)) {
      continue;
    }
    const known = tallies.get(sponsorship.login);
    if (known === undefined) {
      tallies.set(sponsorship.login, {
        avatarUrl: sponsorship.avatarUrl,
        createdAt: sponsorship.createdAt,
        dollars: 0,
        login: sponsorship.login,
        monthlyDollars: sponsorship.monthlyDollars,
        name: sponsorship.name ?? sponsorship.login,
        profileUrl: `https://github.com/${sponsorship.login}`,
        websiteUrl: sponsorship.websiteUrl,
      });
      continue;
    }
    known.createdAt = Math.min(known.createdAt, sponsorship.createdAt);
    known.monthlyDollars += sponsorship.monthlyDollars;
  }
  for (const tally of tallies.values()) {
    tally.dollars = Math.max(
      (paidCents.get(tally.login) ?? 0) / 100,
      tally.monthlyDollars,
    );
  }

  const onGithub = [...tallies.values()];
  for (const backer of opts.openCollective ?? []) {
    if (!backer.isCurrent) {
      continue;
    }
    const dollars = Math.max(backer.paidCents / 100, backer.monthlyDollars);
    const known = onGithub.find((tally) => isSameSponsor(backer, tally));
    if (known !== undefined) {
      known.createdAt = Math.min(known.createdAt, backer.createdAt);
      known.dollars += dollars;
      known.monthlyDollars += backer.monthlyDollars;
      continue;
    }
    const own = backer.githubLogin ?? backer.slug;
    const login = tallies.has(own) ? `opencollective/${backer.slug}` : own;
    tallies.set(login, {
      avatarUrl: backer.avatarUrl,
      createdAt: backer.createdAt,
      dollars,
      login,
      monthlyDollars: backer.monthlyDollars,
      name: backer.name,
      profileUrl: `https://opencollective.com/${backer.slug}`,
      websiteUrl: backer.websiteUrl,
    });
  }

  for (const direct of opts.config.direct) {
    const dollars = directDollars(direct, opts.now);
    const createdAt = Date.parse(direct.since);
    const known = tallies.get(direct.login);
    const monthlyDollars =
      direct.every === 'year' ? direct.dollars / 12 : direct.dollars;
    if (known === undefined) {
      tallies.set(direct.login, {
        avatarUrl: direct.avatarUrl,
        createdAt,
        dollars,
        login: direct.login,
        monthlyDollars,
        name: direct.name,
        profileUrl: `https://github.com/${direct.login}`,
        websiteUrl: direct.websiteUrl,
      });
      continue;
    }
    known.createdAt = Math.min(known.createdAt, createdAt);
    known.dollars += dollars;
    known.monthlyDollars += monthlyDollars;
  }
  for (const extra of opts.config.extra) {
    const known = tallies.get(extra.login);
    if (known !== undefined) {
      known.dollars += extra.dollars;
    }
  }

  const most = Math.max(0, ...[...tallies.values()].map((t) => t.dollars));
  const ranks = new Map(
    [...tallies.values()]
      .filter((tally) => tierFor(tally.monthlyDollars) !== undefined)
      .toSorted(byMonthlyThenPaid)
      .map((tally, index) => [tally.login, index + 1]),
  );
  return [...tallies.values()]
    .map((tally): Sponsor => {
      const tier = tierFor(tally.monthlyDollars);
      const rank = ranks.get(tally.login);
      return {
        createdAt: tally.createdAt,
        imgSrc: tally.avatarUrl,
        link:
          (tally.websiteUrl === null
            ? undefined
            : trackingLink(tally.websiteUrl)) ?? tally.profileUrl,
        login: tally.login,
        name: tally.name,
        ...(tier === undefined || rank === undefined ? {} : { rank, tier }),
        weight:
          most === 0
            ? 1
            : Math.max(1, Math.round((maxWeight * tally.dollars) / most)),
      };
    })
    .toSorted(byStartThenLogin);
}

const byMonthlyThenPaid = Order.combine(
  Order.combine(
    Order.flip(Order.mapInput(Order.Number, (t: Tally) => t.monthlyDollars)),
    Order.flip(Order.mapInput(Order.Number, (t: Tally) => t.dollars)),
  ),
  Order.mapInput(Order.String, (t: Tally) => t.login),
);

const byStartThenLogin = Order.combine(
  Order.mapInput(Order.Number, (sponsor: Sponsor) => sponsor.createdAt),
  Order.mapInput(Order.String, (sponsor: Sponsor) => sponsor.login),
);
