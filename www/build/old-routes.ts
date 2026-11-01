/**
 * Keeps trpc.io's URLs working on this site: its redirects (`www/vercel.json`,
 * copied to `trpc-io-redirects.json` by `old-docs-copy.ts`), the pages it
 * serves (`/docs/…` for v11, `/docs/v10/…`, `/docs/v9/…`, `/blog/…`) and the
 * few it has that this site doesn't copy. Each old URL redirects once, to
 * where trpc.io sent it, as this site serves it: the copied page of its
 * version, which for v11 is at trpc.io's path. `build/vercel-output.ts`
 * writes the routes and fails the build on an old URL that lands nowhere.
 */
import { copiedVersions, v11 } from '../src/site.ts';
import { redirectPattern } from './old-docs-convert.ts';

/** Under the site's root, beside `old-docs.json`. */
export const redirectsFile = 'trpc-io-redirects.json';

/** One of trpc.io's redirects, as `vercel.json` has it. */
export interface TrpcRedirect {
  readonly destination: string;
  readonly permanent: boolean;
  readonly source: string;
}

/** An old URL, and where this site sends it. */
export interface OldRedirect {
  readonly location: string;
  readonly source: string;
  readonly status: 307 | 308;
}

/** A route of Vercel's Build Output config, as far as this site uses them. */
export interface VercelRoute {
  readonly continue?: boolean;
  readonly dest?: string;
  readonly handle?: string;
  readonly has?: ReadonlyArray<unknown>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly missing?: ReadonlyArray<unknown>;
  readonly src?: string;
  readonly status?: number;
}

const external = (url: string) => /^[a-z][a-z\d+.-]*:/i.test(url);

const withoutSlash = (pathname: string) => pathname.replace(/(.)\/$/, '$1');

/**
 * The URL paths the static files answer: `docs/a/index.html` at `/docs/a`,
 * `blog/rss.xml` at itself. Other `.html` files (`404.html`) aren't pages.
 */
export function servedPaths(files: ReadonlyArray<string>): ReadonlySet<string> {
  return new Set(
    files.flatMap((file) => {
      if (file === 'index.html') {
        return ['/'];
      }
      if (file.endsWith('/index.html')) {
        return [`/${file.slice(0, -'/index.html'.length)}`];
      }
      return file.endsWith('.html') ? [] : [`/${file}`];
    }),
  );
}

/** Where trpc.io's redirects send `pathname`: a path or a URL off the site, and the `#hash` a hop added. */
export interface Followed {
  readonly hash: string;
  /** Whether every hop is permanent. */
  readonly permanent: boolean;
  readonly target: string;
}

/** Follows trpc.io's redirects as Vercel does: the first whose source matches, until none does. */
export function follow(
  pathname: string,
  redirects: ReadonlyArray<TrpcRedirect>,
): Followed {
  let current = withoutSlash(pathname);
  let hash = '';
  let permanent = true;
  for (let hops = 0; hops < 10; hops++) {
    const found = redirects
      .map((redirect) => ({
        match: redirectPattern(redirect.source).exec(current),
        redirect,
      }))
      .find((candidate) => candidate.match !== null);
    if (!found?.match) {
      break;
    }
    const groups = found.match.groups ?? {};
    const destination = found.redirect.destination.replaceAll(
      /:(\w+)\*?/g,
      (_param, name: string) => groups[name] ?? '',
    );
    permanent &&= found.redirect.permanent;
    if (external(destination)) {
      return { hash: '', permanent, target: destination };
    }
    const fragment = destination.indexOf('#');
    if (fragment !== -1) {
      hash = destination.slice(fragment);
    }
    current = withoutSlash(
      fragment === -1 ? destination : destination.slice(0, fragment),
    );
  }
  return { hash, permanent, target: current };
}

/** The copied versions, the longest `trpcPath` first, so `/docs/v10` isn't read as v11's `v10` page. */
const byTrpcPath = copiedVersions.toSorted(
  (a, b) => b.trpcPath.length - a.trpcPath.length,
);

/**
 * Where this site serves what trpc.io serves at `target`, or `undefined`
 * when it doesn't: the copied page of its version (`/docs/v10/x` is
 * `/v10/docs/x`; v11's `/docs/x` is itself), a post, an image's copy, or a
 * URL off the site.
 */
export function siteLocation(
  target: string,
  served: ReadonlySet<string>,
): string | undefined {
  if (external(target)) {
    return target;
  }
  const image = /^\/img\/([^/]+)$/.exec(target)?.[1];
  if (image !== undefined) {
    const copy = `${v11.imagePath}/${image}`;
    return served.has(copy) ? copy : undefined;
  }
  for (const version of byTrpcPath) {
    if (
      target !== version.trpcPath &&
      !target.startsWith(`${version.trpcPath}/`)
    ) {
      continue;
    }
    const slug = target.slice(version.trpcPath.length + 1) || version.firstDoc;
    const copy = `${version.basePath}/${slug}`;
    return served.has(copy) ? copy : undefined;
  }
  return served.has(target) ? target : undefined;
}

/**
 * Pages trpc.io serves that this site has no copy of, and where they go
 * here instead.
 */
export const retiredPages: Readonly<Record<string, string>> = {
  '/blog/archive': '/blog',
  '/blog/authors': '/blog',
  // The home page's intro steps, and a Twoslash test page: no sidebar lists them.
  '/docs/landing-intro/Step1': '/',
  '/docs/landing-intro/Step2': '/',
  '/docs/landing-intro/Step3': '/',
  '/docs/test': '/',
  '/docs/v10/landing-intro/Step1': '/',
  '/docs/v10/landing-intro/Step2': '/',
  '/docs/v10/landing-intro/Step3': '/',
  // Its "Pro" plan is the Silver partner tier now.
  '/pricing': '/sponsor',
};

/**
 * Every URL trpc.io serves a page at, as this site's copies have them
 * (`/v10/docs/x` was `/docs/v10/x`), and each copied image's.
 */
export function trpcPages(served: ReadonlySet<string>): ReadonlyArray<string> {
  const pages = [...served].flatMap((pathname) => {
    if (pathname === '/blog' || /^\/blog\/[^/]+$/.test(pathname)) {
      return [pathname];
    }
    if (pathname.startsWith(`${v11.imagePath}/`)) {
      return [`/img/${pathname.slice(v11.imagePath.length + 1)}`];
    }
    const version = copiedVersions.find((candidate) =>
      pathname.startsWith(`${candidate.basePath}/`),
    );
    return version
      ? [`${version.trpcPath}/${pathname.slice(version.basePath.length + 1)}`]
      : [];
  });
  // `/docs`, v11's, is at trpc.io's path, and `routes` redirects it.
  const indexes = copiedVersions
    .filter(
      (version) =>
        version.id !== v11.id &&
        served.has(`${version.basePath}/${version.firstDoc}`),
    )
    .map((version) => version.trpcPath);
  return [...pages, ...indexes];
}

/** Whether `page` is an older version's (`/docs/v10/…`), not v11's. */
const olderVersion = (page: string) =>
  byTrpcPath.some(
    (version) =>
      version.id !== v11.id &&
      (page === version.trpcPath || page.startsWith(`${version.trpcPath}/`)),
  );

/**
 * The URLs a redirect with params (`/docs/reactjs/:path`) answers: those
 * that land on one of `pages`. Not an older version's, which trpc.io
 * redirects to only by accident (`/docs/v11/v10/…`).
 */
function patternSources(
  redirect: TrpcRedirect,
  pages: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const destination = redirectPattern(redirect.destination);
  return pages.flatMap((page) => {
    if (olderVersion(page)) {
      return [];
    }
    const match = destination.exec(page);
    if (!match) {
      return [];
    }
    const groups = match.groups ?? {};
    const source = withoutSlash(
      redirect.source.replaceAll(
        /:(\w+)\*?/g,
        (_param, name: string) => groups[name] ?? '',
      ),
    );
    return source.endsWith('/') ? [] : [source];
  });
}

/**
 * trpc.io's redirects that point at no page, even there, and where they
 * meant to go.
 */
export const fixedRedirects: Readonly<Record<string, string>> = {
  '/docs/aborting-procedures': '/docs/client/vanilla/aborting-procedure-calls',
  '/docs/extra': '/docs/further-reading',
  '/docs/server/api-handler': '/docs/server/adapters',
};

/**
 * Where this site sends each of trpc.io's URLs that it doesn't serve as
 * they are, and the URLs that land nowhere (`problems`).
 */
export function oldRedirects(opts: {
  readonly redirects: ReadonlyArray<TrpcRedirect>;
  readonly served: ReadonlySet<string>;
}): {
  readonly problems: ReadonlyArray<string>;
  readonly redirects: ReadonlyArray<OldRedirect>;
} {
  const redirects = opts.redirects.map((redirect) => {
    const fixed = fixedRedirects[withoutSlash(redirect.source)];
    return fixed === undefined ? redirect : { ...redirect, destination: fixed };
  });
  const pages = trpcPages(opts.served);
  const sources = [
    ...new Set([
      ...redirects.flatMap((redirect) =>
        redirect.source.includes(':')
          ? patternSources(redirect, pages)
          : [withoutSlash(redirect.source)],
      ),
      ...pages,
    ]),
  ];
  const problems: Array<string> = [];
  const found: Array<OldRedirect> = [];
  for (const source of sources) {
    if (opts.served.has(source)) {
      continue;
    }
    const followed = follow(source, redirects);
    const location = siteLocation(followed.target, opts.served);
    if (location === undefined) {
      problems.push(
        `${source}: trpc.io sends it to ${followed.target}, which this site doesn't serve`,
      );
      continue;
    }
    found.push({
      location: `${location}${followed.hash}`,
      source,
      status: followed.permanent ? 308 : 307,
    });
  }
  for (const [source, location] of Object.entries(retiredPages)) {
    if (sources.includes(source) || opts.served.has(source)) {
      continue;
    }
    if (!opts.served.has(location)) {
      problems.push(
        `${source}: goes to ${location}, which this site doesn't serve`,
      );
      continue;
    }
    found.push({ location, source, status: 308 });
  }
  return {
    problems,
    redirects: found.toSorted((a, b) =>
      a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
    ),
  };
}

const escapeRegex = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The longest end `a` and `b` share that starts a path segment: `/x` of `/docs/v10/x` and `/v10/docs/x`. */
function sharedEnd(a: string, b: string) {
  let length = 0;
  while (
    length < a.length &&
    length < b.length &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length++;
  }
  const end = a.slice(a.length - length);
  const segment = end.indexOf('/');
  return segment === -1 ? '' : end.slice(segment);
}

/** Alternatives per route, to keep each `src` short. */
const perRoute = 50;

/**
 * The redirects as Vercel routes, few of them: those that keep the end of
 * the path and change its start (`/docs/v10/x` to `/v10/docs/x`) share a
 * route, matching the ends they keep.
 */
export function redirectRoutes(
  redirects: ReadonlyArray<OldRedirect>,
): ReadonlyArray<VercelRoute> {
  const groups = new Map<
    string,
    { from: string; ends: Array<string>; status: number; to: string }
  >();
  const single: Array<VercelRoute> = [];
  for (const redirect of redirects) {
    const end = sharedEnd(redirect.source, redirect.location);
    if (end === '') {
      single.push({
        headers: { Location: redirect.location },
        src: `^${escapeRegex(redirect.source)}$`,
        status: redirect.status,
      });
      continue;
    }
    const from = redirect.source.slice(0, -end.length);
    const to = redirect.location.slice(0, -end.length);
    const key = JSON.stringify([from, to, redirect.status]);
    const group = groups.get(key) ?? {
      ends: [],
      from,
      status: redirect.status,
      to,
    };
    group.ends.push(end);
    groups.set(key, group);
  }
  const grouped = [...groups.values()].flatMap((group) => {
    const chunks: Array<ReadonlyArray<string>> = [];
    for (let start = 0; start < group.ends.length; start += perRoute) {
      chunks.push(group.ends.slice(start, start + perRoute));
    }
    return chunks.map((ends): VercelRoute => ({
      headers: { Location: `${group.to}$1` },
      src: `^${escapeRegex(group.from)}(${ends.map(escapeRegex).join('|')})$`,
      status: group.status,
    }));
  });
  return [...grouped, ...single];
}

/** How Vercel answers a `GET`: a redirect, a static file, or a 404. */
export type Response =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'redirect';
      readonly location: string;
      readonly status: number;
    };

/**
 * How `routes` answer a plain `GET` of `pathname` (no `Accept:
 * text/markdown`), as Vercel runs them
 * (https://vercel.com/docs/build-output-api/configuration#routes), as far as
 * this site's routes go: a route with a `Location` redirects, `continue`
 * routes only add headers, and `handle: filesystem` serves a file there is.
 */
export function respond(
  routes: ReadonlyArray<VercelRoute>,
  served: ReadonlySet<string>,
  pathname: string,
): Response {
  for (const route of routes) {
    if (route.handle === 'filesystem') {
      if (served.has(pathname)) {
        return { kind: 'file', path: pathname };
      }
      continue;
    }
    if (route.handle === 'error') {
      return { kind: 'missing' };
    }
    if (route.has || route.src === undefined) {
      continue;
    }
    const match = new RegExp(route.src, 'i').exec(pathname);
    if (!match) {
      continue;
    }
    const location = route.headers?.['Location'];
    if (location !== undefined && route.status !== undefined) {
      return {
        kind: 'redirect',
        location: location.replaceAll(
          /\$(\d+)/g,
          (_ref, index: string) => match[Number(index)] ?? '',
        ),
        status: route.status,
      };
    }
  }
  return served.has(pathname)
    ? { kind: 'file', path: pathname }
    : { kind: 'missing' };
}

/**
 * What's wrong with `routes`: an old URL that doesn't redirect once to
 * where `redirects` says, onto a file, or a served file the routes hide.
 */
export function routeProblems(opts: {
  readonly redirects: ReadonlyArray<OldRedirect>;
  readonly routes: ReadonlyArray<VercelRoute>;
  readonly served: ReadonlySet<string>;
}): ReadonlyArray<string> {
  const problems: Array<string> = [];
  for (const redirect of opts.redirects) {
    const result = land(opts.routes, opts.served, redirect.source);
    if (
      result.hops.length !== 1 ||
      result.hops[0] !== redirect.location ||
      result.landed.kind === 'missing'
    ) {
      problems.push(
        `${redirect.source}: redirects to ${result.hops.join(', then ') || 'nowhere'}${result.landed.kind === 'missing' ? ', a 404' : ''}, not once to ${redirect.location}`,
      );
    }
  }
  for (const pathname of opts.served) {
    if (respond(opts.routes, opts.served, pathname).kind !== 'file') {
      problems.push(`${pathname}: a route hides the file`);
    }
  }
  return problems;
}

/** Where a browser ends up from `pathname`: its redirects, and the file or URL off the site it lands on. */
export function land(
  routes: ReadonlyArray<VercelRoute>,
  served: ReadonlySet<string>,
  pathname: string,
): {
  readonly hops: ReadonlyArray<string>;
  readonly landed: Response;
  /** The `#hash` the redirects carry to the page. */
  readonly hash: string;
} {
  const hops: Array<string> = [];
  let current = pathname;
  let hash = '';
  for (;;) {
    const response = respond(routes, served, current);
    if (response.kind !== 'redirect' || hops.length >= 10) {
      return { hash, hops, landed: response };
    }
    hops.push(response.location);
    if (external(response.location)) {
      return { hash, hops, landed: response };
    }
    const url = new URL(response.location, 'https://site.invalid');
    hash = url.hash || hash;
    current = decodeURIComponent(url.pathname);
  }
}
