/**
 * Keeps trpc.io's URLs working on this site: the redirects in `www/vercel.json`,
 * trpc.io's own with the few this site adds, as Vercel routes. The Build
 * Output API doesn't read `vercel.json`'s `redirects`, so
 * `build/vercel-output.ts` writes each as a route, in order, as Vercel would,
 * and fails the build on one that lands nowhere. `legacy-urls-check.ts`
 * checks every URL in trpc.io's sitemap the same way.
 */

/** One of `vercel.json`'s redirects. */
export interface Redirect {
  readonly destination: string;
  readonly permanent: boolean;
  readonly source: string;
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

const escapeRegex = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

/**
 * A redirect as the route Vercel makes of it: `:path` is a segment,
 * `/:path*` the rest of the path, if any, and `permanent` is a 308.
 */
export function redirectRoute(redirect: Redirect): VercelRoute {
  const params: Array<string> = [];
  const src = redirect.source
    .split(/(\/:\w+\*|:\w+)/)
    .map((part) => {
      const rest = /^\/:(\w+)\*$/.exec(part)?.[1];
      if (rest !== undefined) {
        params.push(rest);
        return '(/.*)?';
      }
      const segment = /^:(\w+)$/.exec(part)?.[1];
      if (segment !== undefined) {
        params.push(segment);
        return '([^/]+)';
      }
      return escapeRegex(part);
    })
    .join('');
  const location = redirect.destination.replaceAll(
    /\/:(\w+)\*|:(\w+)/g,
    (param, rest: string | undefined, segment: string | undefined) => {
      const index = params.indexOf(rest ?? segment ?? '');
      return index === -1 ? param : `$${index + 1}`;
    },
  );
  return {
    headers: { Location: location },
    src: `^${src}$`,
    status: redirect.permanent ? 308 : 307,
  };
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

/** What's wrong with how `routes` answer `pathname`, if anything: it lands on a 404, or redirects in a loop. */
export function landingProblem(
  routes: ReadonlyArray<VercelRoute>,
  served: ReadonlySet<string>,
  pathname: string,
): string | undefined {
  const result = land(routes, served, pathname);
  if (result.landed.kind === 'missing') {
    return `${pathname}: ${result.hops.length === 0 ? '' : `redirects to ${result.hops.join(', then ')}, `}a 404`;
  }
  if (result.landed.kind === 'redirect' && !external(result.landed.location)) {
    return `${pathname}: redirects more than ${result.hops.length} times: ${result.hops.join(', ')}`;
  }
  return undefined;
}

/**
 * What's wrong with `routes`: a redirect with no params (`/docs/router`)
 * that doesn't land on a page or off the site, or a served file the routes
 * hide.
 */
export function routeProblems(opts: {
  readonly redirects: ReadonlyArray<Redirect>;
  readonly routes: ReadonlyArray<VercelRoute>;
  readonly served: ReadonlySet<string>;
}): ReadonlyArray<string> {
  const problems = opts.redirects
    .filter((redirect) => !redirect.source.includes(':'))
    .flatMap(
      (redirect) =>
        landingProblem(opts.routes, opts.served, redirect.source) ?? [],
    );
  for (const pathname of opts.served) {
    if (respond(opts.routes, opts.served, pathname).kind !== 'file') {
      problems.push(`${pathname}: a route hides the file`);
    }
  }
  return problems;
}
