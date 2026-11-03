/**
 * The pages whose header shows the line of partners (`PartnersBar`) on small
 * screens: the ones people read, by path prefix. Everywhere else it would
 * repeat what the page says or sit out of place: the home page and
 * `/sponsor` already show the partners, and `/media`, `/search` and the 404
 * page aren't reading pages.
 */
export const partnersBarPrefixes = ['/docs', '/blog'] as const;

/** The pages under those prefixes that ask for sponsors themselves. */
export const partnersBarExcluded = [
  '/docs/community/sponsors',
  '/docs/v10/community/sponsors',
  '/docs/v9/sponsors',
] as const;

const under = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

export function showsPartnersBar(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return (
    partnersBarPrefixes.some((prefix) => under(path, prefix)) &&
    !partnersBarExcluded.some((excluded) => excluded === path)
  );
}
