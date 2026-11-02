#!/usr/bin/env node
/**
 * `pnpm land`: lands the current branch's commits on `origin/v12`. See
 * {@link land}; the workspace is the repository's root, and each changed
 * file is checked with its own tree's config: `vp check` under `next/`,
 * `oxfmt` and `oxlint` with `v11/`'s under `v11/` and the root's elsewhere
 * (the site, `tooling/ui`), and `pnpm lint:docs` on v12's docs pages.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Cause, Console, Effect, Path } from 'effect';

import { run } from '../command.ts';
import { land, LandError } from '../land.ts';

/** `files` under `dir/`, relative to it. */
const under = (dir: string, files: ReadonlyArray<string>) =>
  files.flatMap((file) =>
    file.startsWith(`${dir}/`) ? [file.slice(dir.length + 1)] : [],
  );

const code = (files: ReadonlyArray<string>) =>
  files.filter((file) => /\.[cm]?[jt]sx?$/.test(file));

/**
 * `oxfmt --check`, then `oxlint` on the code (`linted`, all of it unless
 * named), in `dir` with its config.
 */
const oxc = Effect.fn('oxc')(function* (
  dir: string,
  files: ReadonlyArray<string>,
  linted: ReadonlyArray<string> = files,
) {
  yield* run(dir, 'pnpm', [
    'exec',
    'oxfmt',
    '--check',
    '--no-error-on-unmatched-pattern',
    ...files,
  ]);
  if (code(linted).length > 0) {
    yield* run(dir, 'pnpm', [
      'exec',
      'oxlint',
      '--no-error-on-unmatched-pattern',
      ...code(linted),
    ]);
  }
});

const check = Effect.fn('check')(function* (
  root: string,
  files: ReadonlyArray<string>,
) {
  const path = yield* Path.Path;
  const next = under('next', files);
  if (next.length > 0) {
    yield* run(path.join(root, 'next'), 'pnpm', [
      'exec',
      'vp',
      'check',
      '--no-error-on-unmatched-pattern',
      ...next,
    ]);
  }
  const v11 = under('v11', files);
  if (v11.length > 0) {
    // v11's lint, like `main`'s, is its packages' own (`--filter=!root`),
    // which leaves its root's files (`vitest.shared.ts`, `scripts/`) out.
    yield* oxc(
      path.join(root, 'v11'),
      v11,
      v11.filter((file) => /^(packages|examples|tooling)\//.test(file)),
    );
  }
  const rest = files.filter(
    (file) => !file.startsWith('next/') && !file.startsWith('v11/'),
  );
  if (rest.length > 0) {
    // The root's lint is its packages' own too: `www`'s `oxlint src build`
    // and `tooling/ui`'s `oxlint src`, leaving out generated samples and the
    // site's check scripts.
    yield* oxc(
      root,
      rest,
      rest.filter((file) =>
        /^(www\/(src|build)|tooling\/ui\/src)\//.test(file),
      ),
    );
  }
  const pages = files.filter(
    (file) => file.startsWith('www/v12/docs/') && file.endsWith('.md'),
  );
  if (pages.length > 0) {
    yield* run(root, 'node', ['next/tooling/docs-lint/docs-lint.ts', ...pages]);
  }
});

land(
  process.cwd(),
  { remote: 'origin', branch: 'v12', workspace: '.', attempts: 5 },
  { install: (dir) => run(dir, 'pnpm', ['install']), check },
).pipe(
  Effect.tapCause((cause) => {
    const error = Cause.squash(cause);
    return Console.error(
      error instanceof LandError ? error.message : Cause.pretty(cause),
    );
  }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
