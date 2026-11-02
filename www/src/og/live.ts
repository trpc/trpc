/**
 * What a social card shows that changes after a deploy, fetched when the
 * card is drawn: the home card's GitHub stars and npm downloads, and the
 * avatars of a post's authors and of the sponsors (`avatar.ts`). A fetch
 * that fails leaves its part out, and the card is cached briefly
 * (`cacheControl`), so the next request tries again.
 */
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { Avatars, fetchAvatars } from './avatar.ts';
import type { OgCard } from './card.ts';

export interface Stats {
  /** `@trpc/server`'s npm downloads last week. */
  readonly downloads?: number | undefined;
  readonly stars?: number | undefined;
}

export interface Live {
  /** Each avatar that loaded, as a `data:` URI, by its URL. */
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

/** GitHub's API answers 60 requests an hour without a token; one raises that. */
export async function fetchStats(
  token = process.env['GITHUB_TOKEN'],
): Promise<Stats> {
  const [stars, downloads] = await Promise.all([
    getJson('https://api.github.com/repos/trpc/trpc', {
      accept: 'application/vnd.github+json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    }).then(
      (data) => numberAt(data, 'stargazers_count'),
      () => undefined,
    ),
    getJson(
      'https://api.npmjs.org/downloads/point/last-week/@trpc/server',
    ).then(
      (data) => numberAt(data, 'downloads'),
      () => undefined,
    ),
  ]);
  return { downloads, stars };
}

/** The avatars `card` draws: a post's authors', or the sponsor card's sponsors'. */
const imagesOf = (card: OgCard): ReadonlyArray<string> => {
  switch (card.kind) {
    case 'post':
      return card.authors.flatMap((author) => author.image ?? []);
    case 'sponsor':
      return [...card.partners, ...card.backers].map(
        (sponsor) => sponsor.image,
      );
    case 'doc':
    case 'home':
      return [];
  }
};

/** What `card` shows live. */
export const live = Effect.fn('live')(function* (card: OgCard) {
  const [stats, avatars] = yield* Effect.all(
    [
      card.kind === 'home'
        ? Effect.promise(() => fetchStats())
        : Effect.succeed<Stats>({}),
      fetchAvatars(imagesOf(card)),
    ],
    { concurrency: 'unbounded' },
  );
  return { avatars, stats } satisfies Live;
});

/**
 * A card is drawn while a crawler waits for it, so a try at an avatar gets
 * 3 seconds and one more chance, not the sponsor sync's patience.
 */
const onRequest = Avatars.layer({ retries: 1, timeout: '3 seconds' }).pipe(
  Layer.provide(FetchHttpClient.layer),
);

/** What `card` shows live, for `routes/og.$.ts`. */
export const fetchLive = (card: OgCard) =>
  Effect.runPromise(live(card).pipe(Effect.provide(onRequest)));

/**
 * How long the CDN keeps `card`'s image: the home card's numbers for a
 * day, a card that's missing something it fetches for ten minutes, and
 * the rest as a page (`undefined`).
 */
export function cacheControl(card: OgCard, live: Live) {
  const missing =
    (card.kind === 'home' &&
      (live.stats.stars === undefined || live.stats.downloads === undefined)) ||
    imagesOf(card).some((image) => !live.avatars.has(image));
  if (missing) {
    return 'public, max-age=0, s-maxage=600';
  }
  return card.kind === 'home'
    ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=3600'
    : undefined;
}
