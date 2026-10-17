/**
 * Writes the build as Vercel Build Output (https://vercel.com/docs/build-output-api/v3)
 * in `.vercel/output`, which Vercel deploys as is. `vercel.json` can't do
 * content negotiation: its rewrites run only when no file matches the URL,
 * and every page is a file. Routes here run before the files, so a page's URL
 * answers `Accept: text/markdown` with the page's markdown.
 */
import { fileURLToPath } from 'node:url';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Data, Effect, FileSystem, Path } from 'effect';

import { site } from '../src/site.ts';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

class VercelOutputError extends Data.TaggedError('VercelOutputError')<{
  readonly message: string;
}> {}

/** The slug of the first page in sidebar order, which `llms.txt` lists in. */
export const firstDoc = (llmsTxt: string): string | undefined =>
  /\]\([^)\s]*\/docs\/([\w/-]+)\.md\)/.exec(llmsTxt)?.[1];

/**
 * Prerendering writes `/docs/client/links` as `docs/client/links/index.html`;
 * serve it at `/docs/client/links`, without a trailing slash. Markdown and
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

/** Slugs nest: `/docs/client/links`. */
const docPath = '^/docs/([\\w/-]+)';

export const routes = (first: string) => [
  { headers: { Location: '/$1' }, src: '^/(.+)/$', status: 308 },
  { headers: { Location: '/$1' }, src: '^/(.+)\\.html$', status: 308 },
  { headers: { Location: `/docs/${first}` }, src: '^/docs$', status: 307 },
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
      Link: '</docs/$1.md>; rel="alternate"; type="text/markdown"',
      Vary: 'Accept',
    },
    src: `${docPath}$`,
  },
  {
    continue: true,
    headers: { Link: `<${site.url}/docs/$1>; rel="canonical"` },
    src: `${docPath}\\.md$`,
  },
  { dest: '/index.md', has: acceptsMarkdown, src: '^/$' },
  { dest: '/docs/$1.md', has: acceptsMarkdown, src: `${docPath}$` },
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

  yield* fs.remove(output, { force: true, recursive: true });
  yield* fs.makeDirectory(output, { recursive: true });
  yield* fs.copy(client, staticDir);
  const files = yield* fs.readDirectory(staticDir, { recursive: true });
  const config = {
    overrides: overrides(files.map((file) => file.split(path.sep).join('/'))),
    routes: routes(first),
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
