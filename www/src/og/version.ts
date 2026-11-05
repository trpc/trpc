/**
 * The social cards' and the sponsor cloud's URLs carry `?v=` their version
 * (`ogImageUrl`, `sponsorCloudUrl`), and each version is drawn once per
 * deploy. `routes/og.$.ts` redirects any other query (an outdated or
 * made-up version, none, or another parameter) to the current version
 * before it draws anything, so a query can't make it draw an image again.
 */

/**
 * The redirect's caching: the CDN keeps it until the next deploy, which
 * brings a new version, and browsers and crawlers ask again.
 */
export const versionRedirectCacheControl = 'public, max-age=0, s-maxage=86400';

/**
 * A redirect from `url` to its path at `?v=` `version` alone, or
 * `undefined` when that's its query already. With no `version`, its path
 * without a query.
 */
export function versionRedirect(url: URL, version: string) {
  const search = version === '' ? '' : `?v=${encodeURIComponent(version)}`;
  if (url.search === search) {
    return undefined;
  }
  return new Response(null, {
    headers: {
      'Cache-Control': versionRedirectCacheControl,
      Location: `${url.pathname}${search}`,
    },
    status: 307,
  });
}
