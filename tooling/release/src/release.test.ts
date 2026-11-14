import { createServer, type Server } from 'node:http';
import { NodeServices } from '@effect/platform-node';
import { Duration, Effect, Exit, FileSystem, Path, type Scope } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'vitest';
import { git } from './command.ts';
import {
  auto,
  autoBump,
  branchMoved,
  defaultWait,
  latestTag,
  packCanary,
  publishStable,
  stableVersion,
  tarballUrl,
  waitForVersions,
} from './release.ts';
import { bumps, type Bump } from './version.ts';
import { writeVersions } from './workspace.ts';

const run = <TValue, TError>(
  effect: Effect.Effect<
    TValue,
    TError,
    | FileSystem.FileSystem
    | Path.Path
    | Scope.Scope
    | ChildProcessSpawner.ChildProcessSpawner
  >,
) =>
  Effect.runPromise(
    effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

const commit = Effect.fn('commit')(function* (root: string, message: string) {
  yield* git(
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '--allow-empty',
    '--message',
    message,
  );
});

const repo = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped();
  yield* git(root, 'init', '--quiet', '--initial-branch', 'main');
  yield* commit(root, 'initial');
  return root;
});

const tag = (root: string, name: string) => git(root, 'tag', '--no-sign', name);

describe('latestTag', () => {
  it('finds the latest stable tag and skips prereleases', () =>
    run(
      Effect.gen(function* () {
        const root = yield* repo;
        yield* tag(root, 'v11.22.1');
        yield* commit(root, 'feat: a');
        yield* tag(root, 'v11.23.0-rc.0');
        yield* commit(root, 'fix: b');
        expect(yield* latestTag(root)).toBe('v11.22.1');
        yield* tag(root, 'v11.23.0');
        expect(yield* latestTag(root)).toBe('v11.23.0');
        expect(yield* latestTag(root, 'v11.23.0^')).toBe('v11.22.1');
      }),
    ));
});

describe('branchMoved', () => {
  it('tells whether the remote branch has commits HEAD lacks', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const remote = yield* repo;
        const clone = yield* fs.makeTempDirectoryScoped();
        yield* git(clone, 'clone', '--quiet', remote, '.');
        expect(yield* branchMoved(clone, 'origin', 'main')).toBe(false);
        yield* commit(clone, 'chore: release v11.23.1');
        expect(yield* branchMoved(clone, 'origin', 'main')).toBe(false);
        yield* commit(remote, 'fix: merged meanwhile');
        expect(yield* branchMoved(clone, 'origin', 'main')).toBe(true);
      }),
    ));
});

const failure = <TValue, TError, TRequirements>(
  effect: Effect.Effect<TValue, TError, TRequirements>,
) =>
  effect.pipe(
    Effect.exit,
    Effect.map((exit) => (Exit.isFailure(exit) ? String(exit.cause) : 'ok')),
  );

describe('the release guards', () => {
  it('publishes a stable release only from the branch', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const remote = yield* repo;
        yield* tag(remote, 'v11.23.0');
        const clone = yield* fs.makeTempDirectoryScoped();
        yield* git(clone, 'clone', '--quiet', remote, '.');
        yield* commit(clone, 'fix: not merged');
        const release = publishStable(clone, {
          bump: 'patch',
          distTag: 'latest',
          dryRun: false,
          provenance: false,
          remote: 'origin',
          branch: 'main',
          wait: defaultWait,
          major: 11,
          dir: yield* fs.makeTempDirectoryScoped(),
        });
        expect(yield* failure(release)).toContain(
          "HEAD isn't on origin main; release from main. Nothing was published.",
        );
      }),
    ));

  it('packs a canary only from a clean working tree', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* repo;
        yield* tag(root, 'v11.23.0');
        yield* fs.writeFileString(path.join(root, 'edit.ts'), '');
        const canary = packCanary(root, {
          preid: 'canary',
          since: undefined,
          dir: yield* fs.makeTempDirectoryScoped(),
        });
        expect(yield* failure(canary)).toContain(
          'The working tree has changes',
        );
      }),
    ));
});

describe('the major guard', () => {
  const opts = {
    distTag: 'latest',
    dryRun: true,
    provenance: false,
    remote: 'origin',
    branch: 'main',
    wait: defaultWait,
  };
  it('publishes only the major the config sets', () =>
    run(
      Effect.gen(function* () {
        const root = yield* repo;
        yield* tag(root, 'v11.24.0');
        const tagFor = (bump: Bump, major: number) =>
          stableVersion(root, { bump, major }).pipe(Effect.map((v) => v.tag));
        expect(yield* tagFor('patch', 11)).toBe('v11.24.1');
        expect(yield* tagFor('minor', 11)).toBe('v11.25.0');
        expect(yield* failure(tagFor('major', 11))).toContain(
          'major after v11.24.0 is v12.0.0, but releaseMajor in tooling/release/src/config.ts is 11',
        );
        expect(yield* failure(tagFor('patch', 13))).toContain(
          'patch after v11.24.0 is v11.24.1, but releaseMajor in tooling/release/src/config.ts is 13',
        );
      }),
    ));

  it('releases the next major once the config sets it, whatever the bump', () =>
    run(
      Effect.gen(function* () {
        const root = yield* repo;
        yield* tag(root, 'v11.24.0');
        for (const bump of bumps) {
          expect(yield* stableVersion(root, { bump, major: 12 })).toEqual({
            previousTag: 'v11.24.0',
            version: '12.0.0',
            tag: 'v12.0.0',
            reason:
              'releaseMajor in tooling/release/src/config.ts is 12, after v11.24.0',
          });
        }
      }),
    ));

  /** A repo tagged `v11.24.0`, then a commit `subject` to `@trpc/server`'s source. */
  const serverChange = Effect.fn('serverChange')(function* (subject: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* repo;
    yield* fs.makeDirectory(path.join(root, 'packages/server/src'), {
      recursive: true,
    });
    yield* fs.writeFileString(
      path.join(root, 'packages/server/package.json'),
      JSON.stringify({ name: '@trpc/server', files: ['src'] }),
    );
    yield* fs.writeFileString(path.join(root, 'pnpm-workspace.yaml'), '');
    yield* git(root, 'add', '--all');
    yield* commit(root, 'initial packages');
    yield* tag(root, 'v11.24.0');
    yield* fs.writeFileString(
      path.join(root, 'packages/server/src/index.ts'),
      'export {};\n',
    );
    yield* git(root, 'add', '--all');
    yield* commit(root, subject);
    return root;
  });

  it('fails on a breaking commit until the config sets the next major', () =>
    run(
      Effect.gen(function* () {
        const root = yield* serverChange('feat(server)!: a');
        const sha = yield* git(root, 'rev-parse', 'HEAD');
        expect(
          yield* failure(
            autoBump(root, { ...opts, major: 11, notBreaking: [] }),
          ),
        ).toContain(
          `These commits are marked breaking, so they need v12: ${sha} feat(server)!: a. To release v12, merge a pull request that sets releaseMajor in tooling/release/src/config.ts to 12. If they aren't breaking, add their shas to notBreaking there.`,
        );
        expect(
          yield* autoBump(root, { ...opts, major: 12, notBreaking: [] }),
        ).toBe('major');
      }),
    ));

  it("releases a commit marked breaking by mistake by its type once it's in notBreaking", () =>
    run(
      Effect.gen(function* () {
        const root = yield* serverChange('feat(server)!: a');
        const sha = yield* git(root, 'rev-parse', 'HEAD');
        expect(
          yield* autoBump(root, { ...opts, major: 11, notBreaking: [sha] }),
        ).toBe('minor');
      }),
    ));

  it('releases the next major once the config sets it, even with nothing else to release', () =>
    run(
      Effect.gen(function* () {
        const root = yield* repo;
        yield* tag(root, 'v11.24.0');
        expect(
          yield* autoBump(root, { ...opts, major: 12, notBreaking: [] }),
        ).toBe('major');
        expect(
          yield* autoBump(root, { ...opts, major: 11, notBreaking: [] }),
        ).toBeUndefined();
      }),
    ));

  // `major: 10` stops `stable` before it installs or builds, with the version it would release.
  it('releases a fix as a patch and a feat as a minor', () =>
    run(
      Effect.gen(function* () {
        const fix = yield* serverChange('fix(server): a');
        expect(
          yield* failure(auto(fix, { ...opts, major: 10, notBreaking: [] })),
        ).toContain('patch after v11.24.0 is v11.24.1');
        const feat = yield* serverChange('feat(server): a');
        expect(
          yield* failure(auto(feat, { ...opts, major: 10, notBreaking: [] })),
        ).toContain('minor after v11.24.0 is v11.25.0');
      }),
    ));

  it('releases nothing, and no canary, for a change and its revert', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* serverChange('feat(server): a');
        yield* fs.remove(path.join(root, 'packages/server/src/index.ts'));
        yield* git(root, 'add', '--all');
        yield* commit(root, 'revert: feat(server): a');
        expect(
          yield* auto(root, { ...opts, major: 10, notBreaking: [] }),
        ).toBeUndefined();
        const dir = yield* fs.makeTempDirectoryScoped();
        expect(
          yield* packCanary(root, { preid: 'canary', dir, since: 'v11.24.0' }),
        ).toBeUndefined();
      }),
    ));
});

describe('writeVersions', () => {
  it('versions every package, pins peers and keeps workspace ranges', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const write = (file: string, value: unknown) =>
          Effect.gen(function* () {
            yield* fs.makeDirectory(path.join(root, path.dirname(file)), {
              recursive: true,
            });
            yield* fs.writeFileString(
              path.join(root, file),
              `${JSON.stringify(value, null, 2)}\n`,
            );
          });
        const read = (file: string) =>
          fs
            .readFileString(path.join(root, file))
            .pipe(Effect.map((raw) => JSON.parse(raw) as unknown));
        yield* write('packages/server/package.json', {
          name: '@trpc/server',
          version: '11.22.1',
        });
        yield* write('packages/openapi/package.json', {
          name: '@trpc/openapi',
          version: '11.22.1-alpha',
          peerDependencies: { '@trpc/server': '11.22.1' },
          devDependencies: { '@trpc/server': 'workspace:*' },
        });
        yield* write('packages/tests/package.json', {
          name: '@trpc/tests',
          version: '11.22.1',
          private: true,
        });

        const result = yield* writeVersions(root, '11.23.0');

        expect(result.files).toEqual([
          'packages/openapi/package.json',
          'packages/server/package.json',
          'packages/tests/package.json',
        ]);
        expect([...result.published]).toEqual([
          ['@trpc/server', '11.23.0'],
          ['@trpc/openapi', '11.23.0-alpha'],
        ]);
        expect(yield* read('packages/openapi/package.json')).toEqual({
          name: '@trpc/openapi',
          version: '11.23.0-alpha',
          peerDependencies: { '@trpc/server': '11.23.0' },
          devDependencies: { '@trpc/server': 'workspace:*' },
        });
      }),
    ));
});

describe('tarballUrl', () => {
  it('points at the scoped tarball', () => {
    expect(
      tarballUrl('https://registry.npmjs.org/', '@trpc/server', '11.23.0'),
    ).toBe('https://registry.npmjs.org/@trpc/server/-/server-11.23.0.tgz');
  });
});

/** A registry that serves a tarball once it has been asked for it `after` times. */
const registry = (after: number) =>
  Effect.acquireRelease(
    Effect.callback<{
      server: Server;
      url: string;
      requests: () => number;
    }>((resume) => {
      let requests = 0;
      const server = createServer((_req, res) => {
        requests++;
        res.statusCode = requests > after ? 200 : 404;
        res.end();
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' ? address?.port : undefined;
        resume(
          Effect.succeed({
            server,
            url: `http://127.0.0.1:${port}`,
            requests: () => requests,
          }),
        );
      });
    }),
    ({ server }) =>
      Effect.callback<void>((resume) => {
        server.close(() => resume(Effect.void));
      }),
  );

describe('waitForVersions', () => {
  it('waits until npm serves the version', () =>
    run(
      Effect.gen(function* () {
        const npm = yield* registry(2);
        yield* waitForVersions(
          new Map([['@trpc/server', '11.23.0']]),
          npm.url,
          {
            timeout: Duration.seconds(5),
            interval: Duration.millis(10),
          },
        );
        expect(npm.requests()).toBe(3);
      }),
    ));

  it('fails, naming what npm still holds back, after the timeout', () =>
    run(
      Effect.gen(function* () {
        const npm = yield* registry(Infinity);
        const exit = yield* waitForVersions(
          new Map([['@trpc/server', '11.23.0']]),
          npm.url,
          {
            timeout: Duration.millis(50),
            interval: Duration.millis(10),
          },
        ).pipe(Effect.exit);
        expect(Exit.isFailure(exit) && String(exit.cause)).toContain(
          "npm accepted these but doesn't serve them yet: @trpc/server@11.23.0",
        );
      }),
    ));
});
