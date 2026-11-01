/**
 * Each version's first page is at the version's path, as on trpc.io:
 * `/docs/v10` is v10's introduction, and `/docs/v10/introduction` redirects
 * there (`vercel.json`). The routes match it by its slug
 * (`/docs/v10/$`), so the router reads the version's path as the first
 * page's, and writes links to the first page as the version's path.
 */
import type { LocationRewrite } from '@tanstack/react-router';

import { versionsByPath } from './site.ts';

const withPathname = (url: URL, pathname: string) => {
  const next = new URL(url);
  next.pathname = pathname;
  return next;
};

export const firstDocRewrite: LocationRewrite = {
  input: ({ url }) => {
    const version = versionsByPath.find(
      (candidate) => url.pathname === candidate.basePath,
    );
    return version === undefined
      ? undefined
      : withPathname(url, `${version.basePath}/${version.firstDoc}`);
  },
  output: ({ url }) => {
    const version = versionsByPath.find(
      (candidate) =>
        url.pathname === `${candidate.basePath}/${candidate.firstDoc}`,
    );
    return version === undefined
      ? undefined
      : withPathname(url, version.basePath);
  },
};
