/**
 * The social cards and the sponsor cloud are served with their version in
 * the path, `/og/<version>/docs/quickstart.png`, a hash of what they draw
 * (`build/og-cards.ts`), so a changed image gets a new URL and an image at
 * the current version can be cached for good. `routes/og.$.ts` redirects
 * any other URL for one (its path without a version, an outdated or
 * made-up one, or any query) to the current version's before it draws
 * anything, so no URL but the current one makes it draw an image.
 *
 * The build scripts import this with Node, so it imports nothing.
 */

/** An image at the current version, which only a new version changes. */
export const immutableCacheControl =
  'public, max-age=31536000, s-maxage=31536000, immutable';

/**
 * The redirect's caching: the CDN keeps it until the next deploy, which
 * brings a new version, and browsers and crawlers ask again.
 */
export const versionRedirectCacheControl = 'public, max-age=0, s-maxage=86400';

/** `/og/a/b.png` at `version`: `/og/<version>/a/b.png`, or as is with no version. */
export const versionedPath = (path: string, version: string) =>
  version ? path.replace(/^\/og\//, `/og/${version}/`) : path;

/** What a request's path names: an image's unversioned path, and the version it asks for. */
export interface RequestedImage {
  readonly path: string;
  readonly version: string;
}

/**
 * The image `pathname` names, if one `exists`: `/og/a.png` at no version
 * (`''`), or `/og/<version>/a.png`.
 */
export function requestedImage(
  pathname: string,
  exists: (path: string) => boolean,
): RequestedImage | undefined {
  if (exists(pathname)) {
    return { path: pathname, version: '' };
  }
  const versioned = /^\/og\/([^/]+)(\/.+)$/.exec(pathname);
  const [, version = '', rest = ''] = versioned ?? [];
  const path = `/og${rest}`;
  return versioned !== null && exists(path) ? { path, version } : undefined;
}

/**
 * A redirect from `url`, which asks for `requested`, to its image at
 * `current`, the version this deploy draws, without a query; or
 * `undefined` when `url` is that already.
 */
export function versionRedirect(
  url: URL,
  requested: RequestedImage,
  current: string,
) {
  if (requested.version === current && url.search === '') {
    return undefined;
  }
  return new Response(null, {
    headers: {
      'Cache-Control': versionRedirectCacheControl,
      Location: versionedPath(requested.path, current),
    },
    status: 307,
  });
}
