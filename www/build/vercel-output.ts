/**
 * Writes the build as Vercel Build Output (https://vercel.com/docs/build-output-api/v3)
 * in `.vercel/output`, which Vercel deploys as is. `vercel.json` can't do
 * content negotiation: its rewrites run only when no file matches the URL,
 * and every page is a file. Routes here run before the files, so a page's URL
 * answers `Accept: text/markdown` with the page's markdown, and trpc.io's old
 * URLs redirect to where this site serves them (`old-routes.ts`).
 */
import { fileURLToPath } from 'node:url';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Data, Effect, FileSystem, Path, Schema } from 'effect';

import { indexable, indexedHost } from '../src/seo.ts';
import {
  copiedVersions,
  hiddenPaths,
  site,
  unindexedPaths,
  v11,
} from '../src/site.ts';
import {
  hiddenPathProblems,
  hiddenRoute,
  hiddenRouteProblems,
  isNoindex,
  unindexedPathProblems,
  unindexedRoute,
} from './hidden-paths.ts';
import {
  onDemandRoutes,
  pageCacheControl,
  writeOnDemandFunction,
} from './on-demand.ts';
import {
  oldRedirects,
  redirectRoutes,
  redirectsFile,
  routeProblems,
  servedPaths,
  type VercelRoute,
} from './old-routes.ts';

const TrpcRedirects = Schema.Array(
  Schema.Struct({
    destination: Schema.String,
    permanent: Schema.Boolean,
    source: Schema.String,
  }),
);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

class VercelOutputError extends Data.TaggedError('VercelOutputError')<{
  readonly message: string;
}> {}

/**
 * Prerendering writes `/docs/client/links` as
 * `docs/client/links/index.html`; serve it at `/docs/client/links`,
 * without a trailing slash. Markdown and
 * text files get a `charset`, so non-ASCII characters survive. `files` are
 * `/`-separated, relative to the static directory.
 */
export const overrides = (files: ReadonlyArray<string>) =>
  Object.fromEntries(
    files.flatMap((file) => {
      const contentType = contentTypes.get(/\.[^./]+$/.exec(file)?.[0] ?? '');
      if (!contentType || file === 'index.html' || file === '404.html') {
        return [];
      }
      return file.endsWith('/index.html')
        ? [[file, { contentType, path: file.slice(0, -'/index.html'.length) }]]
        : [[file, { contentType }]];
    }),
  );

const acceptsMarkdown = [
  { key: 'accept', type: 'header', value: '(.*)text/markdown(.*)' },
];

/** A v11 page, the only docs with markdown. Slugs nest: `/docs/client/links`. */
const docPath = `^${v11.basePath}/([\\w/-]+)`;

/**
 * `X-Robots-Tag: noindex` on every response (pages, markdown, `llms.txt`,
 * images), unless the build is `indexable`; then on every host but trpc.io
 * (an old alias, the deployment's own URLs).
 */
export const noindexRoute = (
  siteUrl: string,
  vercelEnv: string,
): VercelRoute => ({
  continue: true,
  headers: { 'X-Robots-Tag': 'noindex' },
  ...(indexable(siteUrl, vercelEnv)
    ? {
        missing: [
          { type: 'host', value: `^${indexedHost.replaceAll('.', '\\.')}$` },
        ],
      }
    : {}),
  src: '^/.*$',
});

export { isNoindex };

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `X-Robots-Tag: noindex` for the pages `paths` and their markdown, which
 * has no `<meta>` of its own: the experiments' pages, once the site is
 * indexed (before, `noindexRoute` covers them).
 */
export const noindexPageRoutes = (
  paths: ReadonlyArray<string>,
): ReadonlyArray<VercelRoute> =>
  paths.length === 0
    ? []
    : [
        {
          continue: true,
          headers: { 'X-Robots-Tag': 'noindex' },
          src: `^(?:${paths.map(escapeRegExp).join('|')})(?:\\.md)?$`,
        },
      ];

/**
 * `old`: the redirects that keep trpc.io's URLs working (`old-routes.ts`).
 * `noindex`: the routes that say `X-Robots-Tag: noindex`. `hidden`: the
 * paths that say `noindex, nofollow` (`hiddenPaths`). `unindexed`: the
 * paths that say `noindex` on every host (`unindexedPaths`).
 */
export const routes = (
  old: ReadonlyArray<VercelRoute> = [],
  noindex: ReadonlyArray<VercelRoute> = [noindexRoute(site.url, '')],
  hidden: ReadonlyArray<string> = hiddenPaths,
  unindexed: ReadonlyArray<string> = unindexedPaths,
): ReadonlyArray<VercelRoute> => [
  ...noindex,
  ...unindexed.map(unindexedRoute),
  ...hidden.map(hiddenRoute),
  { headers: { Location: '/$1' }, src: '^/(.+)/$', status: 308 },
  // trpc.io answers a page's `index.html` too: `/docs/a/index.html`, `/index.html`.
  {
    headers: { Location: '/$1' },
    src: '^/(?:(.+)/)?index\\.html$',
    status: 308,
  },
  { headers: { Location: '/$1' }, src: '^/(.+)\\.html$', status: 308 },
  // The v11 docs were at `/v11/docs` before they took `/docs`.
  { headers: { Location: '/docs$1' }, src: '^/v11/docs(/.*)?$', status: 308 },
  // A copy's first page is trpc.io's, which never moves.
  ...copiedVersions.map((version) => ({
    headers: { Location: `${version.basePath}/${version.firstDoc}` },
    src: `^${version.basePath}$`,
    status: 308,
  })),
  ...old,
  {
    continue: true,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    src: '^/assets/.*$',
  },
  {
    continue: true,
    headers: { 'Cache-Control': pageCacheControl },
    src: '^/(?!assets/).*$',
  },
  {
    continue: true,
    headers: {
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
    src: '^/.*$',
  },
  {
    continue: true,
    headers: {
      Link: '</llms.txt>; rel="alternate"; type="text/markdown"',
      Vary: 'Accept',
    },
    src: '^/$',
  },
  {
    continue: true,
    headers: {
      Link: `<${v11.basePath}/$1.md>; rel="alternate"; type="text/markdown"`,
      Vary: 'Accept',
    },
    src: `${docPath}$`,
  },
  {
    continue: true,
    headers: { Link: `<${site.url}${v11.basePath}/$1>; rel="canonical"` },
    src: `${docPath}\\.md$`,
  },
  { dest: '/index.md', has: acceptsMarkdown, src: '^/$' },
  {
    dest: `${v11.basePath}/$1.md`,
    has: acceptsMarkdown,
    src: `${docPath}$`,
  },
  ...onDemandRoutes(),
  { handle: 'filesystem' },
  { handle: 'error' },
  { dest: '/404.md', has: acceptsMarkdown, src: '^/.*$', status: 404 },
  { dest: '/404.html', src: '^/.*$', status: 404 },
];

/** Copies `<root>/dist/client` into `<root>/.vercel/output`, with its config. */
export const writeVercelOutput = Effect.fn('writeVercelOutput')(function* (
  root: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const client = path.join(root, 'dist/client');
  const output = path.join(root, '.vercel/output');
  const staticDir = path.join(output, 'static');

  const trpcRedirects = yield* fs
    .readFileString(path.join(root, redirectsFile))
    .pipe(
      Effect.flatMap((json) =>
        Schema.decodeUnknownEffect(Schema.fromJsonString(TrpcRedirects))(json),
      ),
      Effect.mapError(
        (cause) =>
          new VercelOutputError({
            message: `${redirectsFile}: ${cause.message}`,
          }),
      ),
    );

  yield* fs.remove(output, { force: true, recursive: true });
  yield* fs.makeDirectory(output, { recursive: true });
  yield* fs.copy(client, staticDir);
  const entries = yield* fs.readDirectory(staticDir, { recursive: true });
  const files = (yield* Effect.filter(entries, (entry) =>
    Effect.map(
      fs.stat(path.join(staticDir, entry)),
      (info) => info.type === 'File',
    ),
  )).map((file) => file.split(path.sep).join('/'));
  const served = servedPaths(files);
  const old = oldRedirects({ redirects: trpcRedirects, served });
  const vercelEnv = process.env['VERCEL_ENV'] ?? '';
  // Until the site is indexed, every page says `noindex`; under the hidden
  // paths, every response does.
  const noindexPages = indexable(site.url, vercelEnv)
    ? yield* Effect.filter(
        files.filter(
          (file) =>
            file.endsWith('/index.html') &&
            !hiddenPaths.some((basePath) =>
              `/${file}`.startsWith(`${basePath}/`),
            ),
        ),
        (file) =>
          Effect.map(fs.readFileString(path.join(staticDir, file)), isNoindex),
        { concurrency: 'unbounded' },
      )
    : [];
  const allRoutes = routes(redirectRoutes(old.redirects), [
    noindexRoute(site.url, vercelEnv),
    ...noindexPageRoutes(
      noindexPages.map((file) => `/${file.slice(0, -'/index.html'.length)}`),
    ),
  ]);
  const missingAnchors = yield* Effect.filter(old.redirects, (redirect) => {
    const url = new URL(redirect.location, site.url);
    if (url.origin !== new URL(site.url).origin || url.hash === '') {
      return Effect.succeed(false);
    }
    return fs
      .readFileString(path.join(staticDir, url.pathname, 'index.html'))
      .pipe(
        Effect.map((html) => !html.includes(` id="${url.hash.slice(1)}"`)),
        Effect.orElseSucceed(() => true),
      );
  });
  const texts = new Map(
    yield* Effect.forEach(
      files.filter((file) => /\.(?:html|md|txt|xml)$/.test(file)),
      (file) =>
        Effect.map(
          fs.readFileString(path.join(staticDir, file)),
          (text) => [file, text] as const,
        ),
      { concurrency: 32 },
    ),
  );
  const hidden = [
    ...hiddenPaths.flatMap((basePath) =>
      hiddenPathProblems(basePath, texts, {
        agentFiles: false,
        others: hiddenPaths.filter((other) => other !== basePath),
      }),
    ),
    ...hiddenRouteProblems(allRoutes, hiddenPaths),
    ...unindexedPaths.flatMap((basePath) =>
      unindexedPathProblems(basePath, texts, allRoutes),
    ),
  ];
  if (hidden.length > 0) {
    return yield* new VercelOutputError({
      message: `${[...hiddenPaths, ...unindexedPaths].join(', ')} are meant to be hidden or unindexed:\n${hidden.join('\n')}`,
    });
  }
  const problems = [
    ...old.problems,
    ...missingAnchors.map(
      (redirect) =>
        `${redirect.source}: redirects to ${redirect.location}, a heading the page doesn't have`,
    ),
    ...routeProblems({
      redirects: old.redirects,
      routes: allRoutes,
      served,
    }),
  ];
  if (problems.length > 0) {
    return yield* new VercelOutputError({
      message: `trpc.io's old URLs don't all land on a page:\n${problems.join('\n')}`,
    });
  }
  const config = {
    overrides: overrides(files),
    routes: allRoutes,
    version: 3,
  };
  yield* fs.writeFileString(
    path.join(output, 'config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  yield* writeOnDemandFunction(root, output);
});

if (import.meta.main) {
  writeVercelOutput(fileURLToPath(new URL('..', import.meta.url))).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
