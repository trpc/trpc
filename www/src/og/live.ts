/**
 * What a social card shows that changes after a deploy, fetched when the
 * card is drawn: the home card's GitHub stars and npm downloads, and a
 * post's authors' avatars. A fetch that fails leaves its part out, and the
 * card is cached briefly (`cacheControl`), so the next request tries again.
 */
import trpc12Package from '../../../next/packages/trpc/package.json' with { type: 'json' };
import { v12 } from '~/site.ts';

import type { OgCard } from './card.ts';

export interface Stats {
  /** `downloadPackages`' npm downloads last week, added up. */
  readonly downloads?: number | undefined;
  readonly stars?: number | undefined;
}

export interface Live {
  /** Each author's avatar as a `data:` URI, by their `image`. */
  readonly avatars: ReadonlyMap<string, string>;
  readonly stats: Stats;
}

export const noLive: Live = { avatars: new Map(), stats: {} };

const timeoutMs = 4000;

const getJson = async (url: string, headers: Record<string, string> = {}) => {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  return (await response.json()) as unknown;
};

const numberAt = (data: unknown, key: string) => {
  const value =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)[key]
      : undefined;
  return typeof value === 'number' ? value : undefined;
};

/**
 * The packages whose downloads the home card adds up: v11's `@trpc/server`,
 * and where v12 is offered, v12's core too (`decisions/npm-downloads.md`).
 */
export const downloadPackagesFor = (v12Hidden: boolean) =>
  v12Hidden ? ['@trpc/server'] : ['@trpc/server', trpc12Package.name];

export const downloadPackages = downloadPackagesFor(v12.hidden);

/** A package npm doesn't know, one not published yet, had no downloads. */
const weeklyDownloads = async (name: string) => {
  const url = `https://api.npmjs.org/downloads/point/last-week/${name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (response.status === 404) {
    return 0;
  }
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  return numberAt(await response.json(), 'downloads');
};

/** The packages' downloads added up, or `undefined` if one of them failed. */
const totalDownloads = async (packages: ReadonlyArray<string>) => {
  const counts = await Promise.all(packages.map(weeklyDownloads));
  return counts.reduce<number | undefined>(
    (total, count) =>
      total === undefined || count === undefined ? undefined : total + count,
    0,
  );
};

/** GitHub's API answers 60 requests an hour without a token; one raises that. */
export async function fetchStats(
  token = process.env['GITHUB_TOKEN'],
  packages: ReadonlyArray<string> = downloadPackages,
): Promise<Stats> {
  const [stars, downloads] = await Promise.all([
    getJson('https://api.github.com/repos/trpc/trpc', {
      accept: 'application/vnd.github+json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    }).then(
      (data) => numberAt(data, 'stargazers_count'),
      () => undefined,
    ),
    totalDownloads(packages).catch(() => undefined),
  ]);
  return { downloads, stars };
}

/** `https://github.com/KATT.png` at 128 pixels, the size the card needs. */
export const avatarUrl = (image: string) => {
  const url = new URL(image);
  if (
    url.hostname === 'github.com' ||
    url.hostname.endsWith('.githubusercontent.com')
  ) {
    url.searchParams.set('size', '128');
  }
  return url.href;
};

/** An avatar as a `data:` URI satori draws, or `undefined` if it's not to be had. */
export async function fetchAvatar(image: string) {
  try {
    const response = await fetch(avatarUrl(image), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const type = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!response.ok || !['image/jpeg', 'image/png'].includes(type)) {
      return undefined;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return undefined;
  }
}

const authorsOf = (card: OgCard) => (card.kind === 'post' ? card.authors : []);

/** What `card` shows live. */
export async function fetchLive(card: OgCard): Promise<Live> {
  const images = [
    ...new Set(authorsOf(card).flatMap((author) => author.image ?? [])),
  ];
  const [stats, avatars] = await Promise.all([
    card.kind === 'home' ? fetchStats() : {},
    Promise.all(
      images.map(async (image) => [image, await fetchAvatar(image)] as const),
    ),
  ]);
  return {
    avatars: new Map(
      avatars.flatMap(([image, uri]) =>
        uri === undefined ? [] : [[image, uri]],
      ),
    ),
    stats,
  };
}

/**
 * How long the CDN keeps `card`'s image: the home card's numbers for a
 * day, a card that's missing something it fetches for ten minutes, and
 * the rest as a page (`undefined`).
 */
export function cacheControl(card: OgCard, live: Live) {
  const missing =
    (card.kind === 'home' &&
      (live.stats.stars === undefined || live.stats.downloads === undefined)) ||
    authorsOf(card).some(
      (author) => author.image !== undefined && !live.avatars.has(author.image),
    );
  if (missing) {
    return 'public, max-age=0, s-maxage=600';
  }
  return card.kind === 'home'
    ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=3600'
    : undefined;
}
