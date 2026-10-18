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

import { copiedVersions, site, v12 } from '../src/site.ts';
import {
  oldRedirects,
  onTrpcIoRoutes,
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

/** The slug of the first page in sidebar order, which `llms.txt` lists in. */
export const firstDoc = (llmsTxt: string): string | undefined =>
  /\]\([^)\s]*\/docs\/([\w/-]+)\.md\)/.exec(llmsTxt)?.[1];

/**
 * Prerendering writes `/v12/docs/client/links` as
 * `v12/docs/client/links/index.html`; serve it at `/v12/docs/client/links`,
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

/** A v12 page, the only docs with markdown. Slugs nest: `/v12/docs/client/links`. */
const docPath = `^${v12.basePath}/([\\w/-]+)`;

/** `old`: the redirects that keep trpc.io's URLs working (`old-routes.ts`). */
export const routes = (
  first: string,
  old: ReadonlyArray<VercelRoute> = [],
): ReadonlyArray<VercelRoute> => [
  { headers: { Location: '/$1' }, src: '^/(.+)/$', status: 308 },
  { headers: { Location: '/$1' }, src: '^/(.+)\\.html$', status: 308 },
  {
    headers: { Location: `${v12.basePath}/${first}` },
    src: `^${v12.basePath}$`,
    status: 307,
  },
  // The v11 docs were at `/v11/docs` before they took `/docs`.
  { headers: { Location: '/docs$1' }, src: '^/v11/docs(/.*)?$', status: 308 },
  ...copiedVersions.map((version) => ({
    headers: { Location: `${version.basePath}/${version.firstDoc}` },
    src: `^${version.basePath}$`,
    status: 307,
  })),
  ...old,
  {
    continue: true,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    src: '^/assets/.*$',
  },
  {
    continue: true,
    headers: {
      'Cache-Control':
        'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
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
      Link: `<${v12.basePath}/$1.md>; rel="alternate"; type="text/markdown"`,
      Vary: 'Accept',
    },
    src: `${docPath}$`,
  },
  {
    continue: true,
    headers: { Link: `<${site.url}${v12.basePath}/$1>; rel="canonical"` },
    src: `${docPath}\\.md$`,
  },
  { dest: '/index.md', has: acceptsMarkdown, src: '^/$' },
  {
    dest: `${v12.basePath}/$1.md`,
    has: acceptsMarkdown,
    src: `${docPath}$`,
  },
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

  const first = firstDoc(
    yield* fs.readFileString(path.join(client, 'llms.txt')),
  );
  if (first === undefined) {
    return yield* new VercelOutputError({
      message: 'llms.txt links to no docs page',
    });
  }

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
  const allRoutes = routes(first, [
    ...redirectRoutes(old.redirects),
    ...onTrpcIoRoutes(site.url),
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
      siteUrl: site.url,
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
});

if (import.meta.main) {
  writeVercelOutput(fileURLToPath(new URL('..', import.meta.url))).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
