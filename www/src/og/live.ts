/**
 * What a social card shows that changes after a deploy, fetched when the
 * card is drawn: the home card's GitHub stars and npm downloads, and the
 * avatars of a post's authors and of the sponsors. A fetch that fails leaves its part out, and the
 * card is cached briefly (`cacheControl`), so the next request tries again.
 */
import type { OgCard } from './card.ts';

export interface Stats {
  /** `@trpc/server`'s npm downloads last week. */
  readonly downloads?: number | undefined;
  readonly stars?: number | undefined;
}

export interface Live {
  /** Each avatar as a `data:` URI, by its URL. */
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

/** A `width` or `height` in pixels on `tag`, the only kind satori reads. */
const svgLength = (tag: string, name: string) => {
  const value = new RegExp(
    `\\s${name}=['"]((?:\\d+(?:\\.\\d+)?|\\.\\d+))(?:px)?['"]`,
  ).exec(tag)?.[1];
  return value === undefined ? undefined : Number(value);
};

/** The size satori draws an SVG at, as it reads it off the `<svg>` tag. */
const svgSize = (tag: string): readonly [number, number] | undefined => {
  const width = svgLength(tag, 'width');
  const height = svgLength(tag, 'height');
  if (width !== undefined && height !== undefined) {
    return [width, height];
  }
  const box = /viewBox=['"]([^'"]+)['"]/
    .exec(tag)?.[1]
    ?.split(/[, ]/)
    .filter(Boolean)
    .map(Number);
  const [, , boxWidth, boxHeight] = box ?? [];
  if (box?.length !== 4 || boxWidth === undefined || boxHeight === undefined) {
    return undefined;
  }
  if (width !== undefined) {
    return [width, (width * boxHeight) / boxWidth];
  }
  if (height !== undefined) {
    return [(height * boxWidth) / boxHeight, height];
  }
  return [boxWidth, boxHeight];
};

/**
 * Whether satori can draw an SVG: it sizes one by the first `<svg>` tag's
 * `width` and `height` in pixels, either of them with the `viewBox`'s
 * aspect ratio, or the `viewBox` alone, and throws without them.
 */
export const sizableSvg = (svg: string) => {
  const tag = /<svg[^>]*>/i.exec(svg)?.[0];
  const size = tag === undefined ? undefined : svgSize(tag);
  return (
    size?.every((length) => Number.isFinite(length) && length > 0) ?? false
  );
};

/** An avatar as a `data:` URI satori draws, or `undefined` if it's not to be had. */
export async function fetchAvatar(image: string) {
  try {
    const response = await fetch(avatarUrl(image), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const type = response.headers.get('content-type')?.split(';')[0] ?? '';
    // An SVG too, such as the tRPC team's logo (`https://trpc.io/img/logo.svg`).
    if (
      !response.ok ||
      !['image/jpeg', 'image/png', 'image/svg+xml'].includes(type)
    ) {
      return undefined;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (type === 'image/svg+xml' && !sizableSvg(bytes.toString('utf8'))) {
      return undefined;
    }
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return undefined;
  }
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
export async function fetchLive(card: OgCard): Promise<Live> {
  const images = [...new Set(imagesOf(card))];
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
    imagesOf(card).some((image) => !live.avatars.has(image));
  if (missing) {
    return 'public, max-age=0, s-maxage=600';
  }
  return card.kind === 'home'
    ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=3600'
    : undefined;
}
