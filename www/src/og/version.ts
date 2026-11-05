/**
 * A page's social card is at `/og` and the page's path, then its version,
 * a hash of what it draws (`build/og-cards.ts`):
 * `/og/docs/quickstart/<version>.png`, and the home page's
 * `/og/index/<version>.png`. So a changed card gets a new URL, and one at
 * the current version can be cached for good. Images that aren't a page's,
 * as the READMEs' sponsor cloud, are in `_` (`notAPage`), which no page's
 * path starts with. The home card's version also has the UTC day
 * (`dailyVersion`), for its live numbers, and the home page is regenerated
 * through the day to name it (`build/on-demand.ts`).
 *
 * `og/serve.ts` redirects any other URL for one to it before it draws
 * anything: `/og` and the page's path, with `.png` or without, at another
 * version, or with a query. So no URL but the current one draws an image,
 * and `/og/docs/quickstart` shows that page's card.
 *
 * The build scripts import this with Node, so it imports nothing.
 */

/** An image at the current version, which only a new version changes. */
export const immutableCacheControl =
  'public, max-age=31536000, s-maxage=31536000, immutable';

/**
 * The redirect's caching: the CDN keeps it `seconds`, until the version
 * changes (`untilVersionChanges`), and browsers and crawlers ask again.
 */
export const versionRedirectCacheControl = (seconds: number) =>
  `public, max-age=0, s-maxage=${seconds}`;

/** `now`'s day in UTC, as `YYYYMMDD`. */
export const utcDay = (now: Date) =>
  now.toISOString().slice(0, 10).replaceAll('-', '');

/**
 * The home card's version on `day` (`utcDay`): the cards' `version` and
 * the day, so the card's live numbers get a new URL every day.
 */
export const dailyVersion = (version: string, day: string) =>
  version ? `${version}-${day}` : '';

/**
 * How long, from `now`, a version stays current, in seconds: a daily one
 * (`dailyVersion`) until the next UTC day, any other until the next deploy,
 * which the CDN's cache doesn't outlive.
 */
export const untilVersionChanges = (daily: boolean, now: Date) => {
  const day = 86_400;
  return daily ? day - Math.floor((now.getTime() / 1000) % day) : day;
};

/**
 * What a version looks like: the cards' and the cloud's hash, and the
 * home card's day (`dailyVersion`). No page's last segment may look like
 * one (`ogCardsSource`), or its card's URL would be its parent's.
 */
export const versionLike = /^[0-9a-f]{10}(?:-\d{8})?$/;

/**
 * Where `name`, an image that isn't a page's card, is served as if it were
 * a page's: in `_`, which is never escaped in a URL and starts no page's
 * path (`ogCardsSource`).
 */
export const notAPage = (name: string) => `/_/${name}`;

/** The home page's segment in its card's URL, as `/og/index`. */
const homeSegment = '/index';

/** Where `page`'s card is at `version`; at no version, `/og` and its path with `.png`. */
export const ogImagePath = (page: string, version: string) => {
  const base = `/og${page === '/' ? homeSegment : page}`;
  return version ? `${base}/${version}.png` : `${base}.png`;
};

/**
 * The page `pathname` asks for the card of, if one `exists`: `/og` and its
 * path, with `.png` or without, or with `/<version>.png` after it, any
 * that looks like one, so another redirects (`versionRedirect`).
 */
export function requestedPage(
  pathname: string,
  exists: (page: string) => boolean,
): string | undefined {
  if (!/^\/og(?:$|\/)/.test(pathname)) {
    return undefined;
  }
  const png = pathname.endsWith('.png');
  const named = (png ? pathname.slice(0, -'.png'.length) : pathname).slice(
    '/og'.length,
  );
  const page = (path: string) =>
    path === '' || path === homeSegment ? '/' : path;
  if (exists(page(named))) {
    return page(named);
  }
  const slash = named.lastIndexOf('/');
  const parent = page(named.slice(0, slash));
  return png && versionLike.test(named.slice(slash + 1)) && exists(parent)
    ? parent
    : undefined;
}

/** A redirect to `location`, which the CDN keeps `seconds`. */
export const redirectTo = (location: string, seconds: number) =>
  new Response(null, {
    headers: {
      'Cache-Control': versionRedirectCacheControl(seconds),
      Location: location,
    },
    status: 307,
  });

/**
 * A redirect from `url`, which asks for `page`'s card, to it at `current`,
 * the version this deploy draws now, without a query, which the CDN keeps
 * `seconds`; or `undefined` when `url` is that already.
 */
export function versionRedirect(
  url: URL,
  page: string,
  current: string,
  seconds: number,
) {
  const canonical = ogImagePath(page, current);
  return url.pathname === canonical && url.search === ''
    ? undefined
    : redirectTo(canonical, seconds);
}
