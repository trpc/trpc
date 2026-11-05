/**
 * What a social card shows that changes after a deploy, fetched when the
 * card is drawn: the home card's GitHub stars and npm downloads, and the
 * avatars of a post's authors, and the sponsors on `/sponsor`'s card or
 * along any other card's foot, and in the READMEs' sponsor cloud
 * (`avatar.ts`). A fetch
 * that fails leaves its part out, and the card is cached briefly
 * (`cacheControl`), so the next request tries again.
 */
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { cardFooter } from '~/sponsors.ts';

import { Avatars, fetchAvatars } from './avatar.ts';
import type { CardFooter, OgCard } from './card.ts';
import { immutableCacheControl } from './version.ts';

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

/**
 * The avatars `card` draws: the sponsor card's sponsors', or the sponsors'
 * along any other card's `footer`, and a post's authors'.
 */
const imagesOf = (card: OgCard, footer: CardFooter): ReadonlyArray<string> => {
  const images = [...footer.partners, ...footer.backers].map(
    (sponsor) => sponsor.image,
  );
  switch (card.kind) {
    case 'post':
      return [
        ...card.authors.flatMap((author) => author.image ?? []),
        ...images,
      ];
    case 'sponsor':
      return [...card.partners, ...card.backers].map(
        (sponsor) => sponsor.image,
      );
    case 'doc':
    case 'home':
      return images;
  }
};

/**
 * What `card` shows live, with the sponsors in `footer` along its foot. It fetches all of a
 * card's avatars at once, a few dozen at most, so a slow host costs one
 * avatar's wait, not one per batch.
 */
export const live = Effect.fn('live')(function* (
  card: OgCard,
  footer: CardFooter = cardFooter,
) {
  const [stats, avatars] = yield* Effect.all(
    [
      card.kind === 'home'
        ? Effect.promise(() => fetchStats())
        : Effect.succeed<Stats>({}),
      fetchAvatars(imagesOf(card, footer), 'unbounded'),
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
 * The avatars of `images` that load, by URL, for the sponsor cloud
 * (`sponsor-cloud.ts`): all at once, as a card's.
 */
export const fetchCloudAvatars = (images: ReadonlyArray<string>) =>
  Effect.runPromise(
    fetchAvatars(images, 'unbounded').pipe(Effect.provide(onRequest)),
  );

/**
 * How long `card`'s image, at the current version, is kept: a card that's
 * missing something it fetches for ten minutes on the CDN, the home card,
 * whose numbers its version doesn't cover, for a day, and the rest for
 * good (`og/version.ts`).
 */
export function cacheControl(
  card: OgCard,
  live: Live,
  footer: CardFooter = cardFooter,
): string {
  const missing =
    (card.kind === 'home' &&
      (live.stats.stars === undefined || live.stats.downloads === undefined)) ||
    imagesOf(card, footer).some((image) => !live.avatars.has(image));
  if (missing) {
    return 'public, max-age=0, s-maxage=600';
  }
  return card.kind === 'home'
    ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=3600'
    : immutableCacheControl;
}
