/**
 * Checks that trpc.io's URLs still work: each in `trpc-io-urls.txt` (its
 * sitemap before this site replaced it) and each redirect source in
 * `vercel.json` without params lands on a page or off the site, and the
 * older versions' pages the sitemap lists (`/docs/v10/…`, `/docs/v9/…`)
 * answer at their own URL, with no redirect but the trailing slash's. `node
 * build/legacy-urls-check.ts` checks the routes the build wrote in
 * `.vercel/output`; `--base <url>` checks a deploy over HTTP, with
 * `VERCEL_AUTOMATION_BYPASS_SECRET` for a protected preview.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect, FileSystem, Path, Schema } from 'effect';

import { land, type Response, servedPaths } from './old-routes.ts';

const here = (relative: string) => new URL(relative, import.meta.url).pathname;

const VercelJson = Schema.Struct({
  redirects: Schema.Array(Schema.Struct({ source: Schema.String })),
});

const Config = Schema.Struct({
  routes: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
});

/** Where a URL lands: the redirects it takes, and the answer at the end. */
interface Landing {
  readonly hops: ReadonlyArray<string>;
  readonly landed: Response;
}

/** The home page's intro steps, which Docusaurus also served as pages; they redirect to `/`. */
const retired = /^\/docs\/v10\/landing-intro\//;

const external = (url: string) => /^[a-z][a-z\d+.-]*:/i.test(url);

/** Lands each path through the routes and files in `.vercel/output`. */
const builtLandings = Effect.fn('builtLandings')(function* (
  paths: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const output = here('../.vercel/output');
  const config = yield* fs
    .readFileString(path.join(output, 'config.json'))
    .pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Config))),
    );
  const staticDir = path.join(output, 'static');
  const entries = yield* fs.readDirectory(staticDir, { recursive: true });
  const files = yield* Effect.filter(entries, (entry) =>
    Effect.map(
      fs.stat(path.join(staticDir, entry)),
      (info) => info.type === 'File',
    ),
  );
  const served = servedPaths(
    files.map((file) => file.split(path.sep).join('/')),
  );
  return paths.map((pathname): Landing =>
    land(config.routes, served, pathname),
  );
});

/** Lands each path on the deploy at `base`, following its redirects. */
const deployedLandings = Effect.fn('deployedLandings')(function* (
  base: string,
  paths: ReadonlyArray<string>,
) {
  const bypass = process.env['VERCEL_AUTOMATION_BYPASS_SECRET'];
  const headers: Record<string, string> =
    bypass === undefined ? {} : { 'x-vercel-protection-bypass': bypass };
  return yield* Effect.forEach(
    paths,
    (pathname) =>
      Effect.tryPromise(async (): Promise<Landing> => {
        const hops: Array<string> = [];
        let url = new URL(pathname, base);
        for (;;) {
          const response = await fetch(url, { headers, redirect: 'manual' });
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (location === null) {
            return {
              hops,
              landed: response.ok
                ? { kind: 'file', path: url.pathname }
                : { kind: 'missing' },
            };
          }
          const next = new URL(location, url);
          const hop =
            next.origin === url.origin
              ? `${next.pathname}${next.hash}`
              : next.href;
          hops.push(hop);
          if (next.origin !== url.origin || hops.length > 10) {
            return {
              hops,
              landed: {
                kind: 'redirect',
                location: hop,
                status: response.status,
              },
            };
          }
          url = next;
        }
      }),
    { concurrency: 16 },
  );
});

/**
 * What's wrong with how `pathname` lands, if anything. Only a page trpc.io's
 * sitemap `listed` must answer at its own URL; a redirect source needn't.
 */
export function legacyUrlProblem(
  pathname: string,
  landing: Landing,
  listed: boolean,
): string | undefined {
  const route =
    landing.hops.length === 0
      ? ''
      : `redirects to ${landing.hops.join(', then ')}, `;
  if (landing.landed.kind === 'missing') {
    return `${pathname}: ${route}a 404`;
  }
  if (
    landing.landed.kind === 'redirect' &&
    !external(landing.landed.location)
  ) {
    return `${pathname}: redirects more than ${landing.hops.length} times: ${landing.hops.join(', ')}`;
  }
  const unslashed = pathname.replace(/(.)\/$/, '$1');
  const own = landing.hops.every((hop) => hop === unslashed);
  if (
    listed &&
    /^\/docs\/v(?:9|10)(?:\/|$)/.test(pathname) &&
    !retired.test(pathname) &&
    !own
  ) {
    return `${pathname}: ${route}not its own URL`;
  }
  return undefined;
}

const check = Effect.fn('check')(function* (args: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem;
  const baseIndex = args.indexOf('--base');
  const base = baseIndex === -1 ? undefined : args[baseIndex + 1];
  const listed = (yield* fs.readFileString(here('trpc-io-urls.txt')))
    .split('\n')
    .filter((line) => line !== '');
  const { redirects } = yield* fs
    .readFileString(here('../vercel.json'))
    .pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.fromJsonString(VercelJson)),
      ),
    );
  const listedPaths = new Set(listed);
  const paths = [
    ...new Set([
      ...listed,
      ...redirects
        .map((redirect) => redirect.source)
        .filter((source) => !source.includes(':')),
    ]),
  ];
  const landings =
    base === undefined
      ? yield* builtLandings(paths)
      : yield* deployedLandings(base, paths);
  const problems = paths.flatMap(
    (pathname, index) =>
      legacyUrlProblem(
        pathname,
        landings[index] ?? { hops: [], landed: { kind: 'missing' } },
        listedPaths.has(pathname),
      ) ?? [],
  );
  const where = base ?? '.vercel/output';
  if (problems.length > 0) {
    yield* Console.error(problems.join('\n'));
    return yield* Effect.fail(
      new Error(
        `${problems.length} of trpc.io's ${paths.length} URLs don't work on ${where}`,
      ),
    );
  }
  yield* Console.log(`All ${paths.length} of trpc.io's URLs work on ${where}`);
});

if (import.meta.main) {
  check(process.argv.slice(2)).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
