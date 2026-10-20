/**
 * The pages rendered on request instead of in the build: a URL whose query
 * turns on experiments (`?flags=`, `src/flags.ts`), shows v12 on the home
 * page (`?version=v12`, `src/home-version.ts`, unless v12 is hidden),
 * searches (`/search?q=`, `src/pages.ts`) or holds a choice made on a
 * decisions page (`src/content/decision-search.ts`). The build prerenders each
 * page once, without a query; every combination of flags is a different
 * page, so the host sends those requests to a function running the site's
 * server build, and its CDN caches each URL's response until the next
 * deploy. Everything else is the prerendered file.
 */
import { Effect, FileSystem, Path } from 'effect';
import type { Plugin } from 'vite';

import { decisionSearchKeys } from '../src/content/decision-search.ts';
import { experimentIds } from '../src/experiments.ts';
import { searchPage, searchParam } from '../src/pages.ts';
import { decisions, v12 } from '../src/site.ts';
import type { VercelRoute } from './old-routes.ts';

/** The function's name, and the path routes rewrite to. */
export const onDemandFunction = '_ssr';

/**
 * The query parameter a rewrite carries the requested path in: the function
 * renders that path, with the rest of the query.
 */
export const pathParam = '__pathname';

/** The pages' `Cache-Control`, prerendered or rendered on demand. */
export const pageCacheControl =
  'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A `?flags=` value naming only experiments `ids`, in any order, its commas
 * plain or encoded. Other values (a typo, an experiment that's gone) get the
 * prerendered page, which is what the site renders for them.
 */
export const flagsValue = (ids: ReadonlyArray<string> = experimentIds) => {
  const name = `(?:${ids.map(escapeRegExp).join('|')})`;
  return `^${name}(?:(?:,|%2[cC])${name})*$`;
};

/** A page's path: not an asset, nor a file with an extension. */
const pagePath = '^(/(?!assets/)[^.]*)$';

/** Routes sending the flagged requests to the function, before the files. */
export const onDemandRoutes = (
  ids: ReadonlyArray<string> = experimentIds,
): ReadonlyArray<VercelRoute> => [
  {
    dest: `/${onDemandFunction}?${pathParam}=$1`,
    has: [{ key: 'flags', type: 'query', value: flagsValue(ids) }],
    src: pagePath,
  },
  ...(v12.hidden
    ? []
    : [
        {
          dest: `/${onDemandFunction}?${pathParam}=/`,
          has: [{ key: 'version', type: 'query', value: '^v12$' }],
          src: '^/$',
        },
      ]),
  {
    dest: `/${onDemandFunction}?${pathParam}=${searchPage.path}`,
    has: [{ key: searchParam, type: 'query', value: '^.+$' }],
    src: `^${escapeRegExp(searchPage.path)}$`,
  },
  // Any value: the page drops one it doesn't know, as the browser does.
  ...decisionSearchKeys.map((key) => ({
    dest: `/${onDemandFunction}?${pathParam}=$1`,
    has: [{ key, type: 'query' }],
    src: `^(${escapeRegExp(decisions.basePath)}(?:/[^.]*)?)$`,
  })),
];

/**
 * The function's entry: a Node.js handler that renders the requested path
 * with the server build's `fetch`, and lets the CDN cache it like a
 * prerendered page.
 */
export const handlerSource = `import { Readable } from 'node:stream';
import server from './server/server.js';

export default async function handler(req, res) {
  const url = new URL(req.url ?? '/', \`https://\${req.headers.host ?? 'localhost'}\`);
  const pathname = url.searchParams.get(${JSON.stringify(pathParam)});
  if (pathname !== null) {
    url.pathname = pathname;
    url.searchParams.delete(${JSON.stringify(pathParam)});
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name.startsWith(':')) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      headers.append(name, one);
    }
  }
  const response = await server.fetch(
    new Request(url, { headers, method: req.method }),
  );
  res.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (name !== 'set-cookie') res.setHeader(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
  res.setHeader('cache-control', ${JSON.stringify(pageCacheControl)});
  if (response.body === null || req.method === 'HEAD') {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}
`;

/**
 * Bundles the server build's dependencies into it, so the function is
 * `dist/server` alone, without `node_modules`.
 */
export function bundledServer(): Plugin {
  return {
    apply: 'build',
    config: () => ({ ssr: { noExternal: true } }),
    name: 'trpc-www:bundled-server',
  };
}

/**
 * Writes the function into `<output>/functions` from `<root>/dist/server`,
 * which `bundledServer` made self-contained.
 */
export const writeOnDemandFunction = Effect.fn('writeOnDemandFunction')(
  function* (root: string, output: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(output, 'functions', `${onDemandFunction}.func`);
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.copy(path.join(root, 'dist/server'), path.join(dir, 'server'));
    yield* fs.writeFileString(path.join(dir, 'index.mjs'), handlerSource);
    yield* fs.writeFileString(
      path.join(dir, 'package.json'),
      `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
    );
    yield* fs.writeFileString(
      path.join(dir, '.vc-config.json'),
      `${JSON.stringify(
        {
          handler: 'index.mjs',
          launcherType: 'Nodejs',
          // The Node that built it: Vercel's, which `engines.node` picks.
          runtime: `nodejs${process.versions.node.split('.')[0]}.x`,
          shouldAddHelpers: false,
          supportsResponseStreaming: true,
        },
        null,
        2,
      )}\n`,
    );
  },
);
