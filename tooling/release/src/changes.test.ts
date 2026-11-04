import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path, type Scope } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'vitest';
import {
  commitBump,
  parseCatalogs,
  publishedChanged,
  publishedManifest,
  publishedPathspecs,
  releasableCommits,
  releaseBump,
} from './changes.ts';
import { git } from './command.ts';

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

describe('commitBump', () => {
  it('reads the bump from the conventional-commit subject', () => {
    expect(commitBump('feat(client): add localLink (#1)')).toBe('minor');
    expect(commitBump('fix(server): handle 405 (#2)')).toBe('patch');
    expect(commitBump('chore: tidy')).toBe('patch');
    expect(commitBump('Remove beta notice')).toBe('patch');
    expect(commitBump('feat(server)!: drop node 18')).toBe('major');
    expect(commitBump('fix!: drop node 18')).toBe('major');
  });

  it('takes the largest bump', () => {
    const commits = (...subjects: Array<string>) =>
      subjects.map((subject) => ({ sha: '0', subject }));
    expect(releaseBump(commits('fix: a', 'chore: b'))).toBe('patch');
    expect(releaseBump(commits('fix: a', 'feat: b'))).toBe('minor');
    expect(releaseBump(commits('feat: a', 'feat!: b'))).toBe('major');
  });
});

describe('publishedPathspecs', () => {
  it('turns `files` into pathspecs, without Markdown, tests or private packages', () => {
    expect(
      publishedPathspecs([
        {
          dir: 'packages/server',
          name: '@trpc/server',
          pkg: {
            files: ['dist', 'src', 'README.md', 'package.json', '!**/*.test.*'],
          },
        },
        {
          dir: 'packages/openapi',
          name: '@trpc/openapi',
          pkg: { files: ['src', '!test'] },
        },
        {
          dir: 'packages/tests',
          name: '@trpc/tests',
          pkg: { private: true, files: ['src'] },
        },
      ]),
    ).toEqual([
      ':(glob)packages/server/dist',
      ':(glob)packages/server/dist/**',
      ':(glob)packages/server/src',
      ':(glob)packages/server/src/**',
      ':(glob)packages/server/README.md',
      ':(glob)packages/server/README.md/**',
      ':(glob)packages/server/tsdown.config.ts',
      ':(glob)packages/server/tsconfig.build.json',
      ':(glob)packages/openapi/src',
      ':(glob)packages/openapi/src/**',
      ':(glob)packages/openapi/tsdown.config.ts',
      ':(glob)packages/openapi/tsconfig.build.json',
      ':(glob)tsconfig.build.json',
      ':(glob,exclude)packages/server/**/*.test.*',
      ':(glob,exclude)packages/server/**/*.test.*/**',
      ':(glob,exclude)packages/server/**/*.md',
      ':(glob,exclude)packages/openapi/**/test',
      ':(glob,exclude)packages/openapi/**/test/**',
      ':(glob,exclude)packages/openapi/**/*.md',
    ]);
  });
});

describe('publishedManifest', () => {
  const opts = {
    catalogs: parseCatalogs(
      [
        'catalog:',
        '  zod: ^4.0.0',
        'catalogs:',
        '  ts-api:',
        '    typescript: ^6.0.3',
      ].join('\n'),
    ),
    workspace: new Set(['@trpc/server']),
  };

  it('ignores the version, scripts, devDependencies and pins to the workspace', () => {
    expect(
      publishedManifest(
        {
          name: '@trpc/client',
          version: '11.23.0',
          scripts: { build: 'tsdown' },
          devDependencies: { vitest: '^5.0.0' },
          peerDependencies: { '@trpc/server': '11.23.0' },
        },
        opts,
      ),
    ).toBe(
      publishedManifest(
        {
          name: '@trpc/client',
          version: '11.24.0',
          scripts: { build: 'tsdown --watch' },
          devDependencies: { vitest: '^6.0.0' },
          peerDependencies: { '@trpc/server': '11.24.0' },
        },
        opts,
      ),
    );
  });

  it('reads catalog ranges', () => {
    expect(
      JSON.parse(
        publishedManifest(
          {
            name: '@trpc/upgrade',
            dependencies: { typescript: 'catalog:ts-api', zod: 'catalog:' },
          },
          opts,
        ),
      ),
    ).toEqual({
      name: '@trpc/upgrade',
      dependencies: { typescript: '^6.0.3', zod: '^4.0.0' },
    });
  });
});

describe('releasableCommits', () => {
  it('finds the commits that change what the packages publish', () =>
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
              typeof value === 'string'
                ? value
                : `${JSON.stringify(value, null, 2)}\n`,
            );
          });
        const commit = (message: string) =>
          Effect.gen(function* () {
            yield* git(root, 'add', '--all');
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
        const server = (extra: Record<string, unknown> = {}) => ({
          name: '@trpc/server',
          version: '11.23.0',
          files: ['dist', 'src', 'README.md', '!**/*.test.*'],
          peerDependencies: { typescript: 'catalog:' },
          ...extra,
        });

        yield* git(root, 'init', '--quiet', '--initial-branch', 'main');
        yield* write('pnpm-workspace.yaml', 'catalog:\n  typescript: ^5.7.2\n');
        yield* write('packages/server/package.json', server());
        yield* write('packages/server/src/index.ts', 'export {};\n');
        yield* write('packages/tests/package.json', {
          name: '@trpc/tests',
          private: true,
        });
        yield* commit('initial');
        yield* git(root, 'tag', '--no-sign', 'v11.23.0');

        const changes = () =>
          releasableCommits(root, 'v11.23.0').pipe(
            Effect.map((commits) => commits.map(({ subject }) => subject)),
          );

        yield* write('www/docs/index.md', '# Docs\n');
        yield* write('examples/minimal/index.ts', 'export {};\n');
        yield* commit('docs: a page');
        yield* write('packages/server/README.md', '# tRPC\n');
        yield* commit('docs: readme');
        yield* write('packages/server/src/index.test.ts', 'test();\n');
        yield* write('packages/tests/server/a.test.ts', 'test();\n');
        yield* commit('test: more');
        yield* write(
          'packages/server/package.json',
          server({ devDependencies: { vitest: '^5.0.0' }, version: '11.24.0' }),
        );
        yield* commit('chore(deps): vitest');
        yield* write(
          'pnpm-workspace.yaml',
          'catalog:\n  typescript: ^5.7.2\n  zod: ^4.0.0\n',
        );
        yield* commit('chore: catalog zod');
        expect(yield* changes()).toEqual([]);
        expect(yield* publishedChanged(root, 'v11.23.0', 'HEAD')).toBe(false);

        yield* write('packages/server/src/index.ts', 'export const a = 1;\n');
        yield* commit('fix(server): a');
        yield* write(
          'pnpm-workspace.yaml',
          'catalog:\n  typescript: ^5.8.0\n  zod: ^4.0.0\n',
        );
        yield* commit('chore: typescript peer');
        yield* write(
          'packages/server/package.json',
          server({ exports: { '.': './dist/index.mjs' } }),
        );
        yield* commit('feat(server): exports');
        yield* write('tsconfig.build.json', { compilerOptions: {} });
        yield* commit('build: root tsconfig');
        expect(yield* changes()).toEqual([
          'build: root tsconfig',
          'feat(server): exports',
          'chore: typescript peer',
          'fix(server): a',
        ]);
        expect(yield* publishedChanged(root, 'v11.23.0', 'HEAD')).toBe(true);

        const beforeRevert = yield* git(root, 'rev-parse', 'HEAD');
        yield* write('packages/server/src/index.ts', 'export const b = 2;\n');
        yield* commit('feat(server): b');
        yield* write('packages/server/src/index.ts', 'export const a = 1;\n');
        yield* commit('revert: feat(server): b');
        expect(
          (yield* releasableCommits(root, beforeRevert)).map((c) => c.subject),
        ).toEqual(['revert: feat(server): b', 'feat(server): b']);
        expect(yield* publishedChanged(root, beforeRevert, 'HEAD')).toBe(false);
        // A rewind: no commits from HEAD to the tag, but what they publish differs.
        expect(yield* publishedChanged(root, 'HEAD', 'v11.23.0')).toBe(true);
      }),
    ));
});
