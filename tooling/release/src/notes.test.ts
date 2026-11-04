import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import { describe, expect, it } from 'vitest';
import { git } from './command.ts';
import {
  changedPackages,
  changesBetween,
  noteSection,
  notesPackages,
  notesEntries,
  parseNewContributors,
  pullRequestNumber,
  renderNotes,
  type Change,
  type GitHubInfo,
  type NotesPackage,
  type PullRequest,
} from './notes.ts';

const repo = 'trpc/trpc';

const packages: ReadonlyArray<NotesPackage> = [
  { dir: 'packages/server', name: '@trpc/server' },
  { dir: 'packages/client', name: '@trpc/client' },
  { dir: 'packages/react-query', name: '@trpc/react-query' },
];

const prUrl = (number: number) => `https://github.com/${repo}/pull/${number}`;

const pr = (number: number, title: string, author = 'KATT'): PullRequest => ({
  number,
  title,
  url: prUrl(number),
  author,
});

const change = (
  sha: string,
  subject: string,
  files: ReadonlyArray<string>,
): Change => ({ sha, subject, files });

const github = (
  prs: ReadonlyArray<PullRequest>,
  commitAuthors: Record<string, string> = {},
): GitHubInfo => ({
  pullRequests: new Map(prs.map((it) => [it.number, it])),
  commitAuthors: new Map(Object.entries(commitAuthors)),
});

const notes = (
  changes: ReadonlyArray<Change>,
  info: GitHubInfo,
  newContributors: ReadonlyArray<{ login: string; url: string }> = [],
) =>
  renderNotes({
    entries: notesEntries({ changes, packages, github: info, repo }),
    packages,
    newContributors,
    repo,
    previousTag: 'v11.24.0',
    tag: 'v11.24.1',
  });

describe('pullRequestNumber', () => {
  it('reads the number a squash merge appends', () => {
    expect(pullRequestNumber('fix(server): a (#7867)')).toBe(7867);
    expect(pullRequestNumber('fix: refs #12 in the middle')).toBeUndefined();
    expect(pullRequestNumber('chore: release v11.24.0')).toBeUndefined();
  });

  it("reads a merge commit's", () => {
    expect(
      pullRequestNumber('Merge pull request #7867 from someone/branch'),
    ).toBe(7867);
    expect(pullRequestNumber('Merge branch main into feature')).toBeUndefined();
  });
});

describe('changedPackages', () => {
  it('counts files in a package directory other than Markdown', () => {
    expect(
      changedPackages(
        [
          'packages/client/src/links/wsLink.ts',
          'packages/server/README.md',
          'packages/server/NOTES.MD',
          'packages/react-query/docs/skills/a.md',
          'packages/tests/server/a.test.ts',
          'www/docs/a.md',
          'packages/serverless/src/index.ts',
        ],
        packages,
      ),
    ).toEqual(['@trpc/client']);
  });

  it('lists the packages in the given order', () => {
    expect(
      changedPackages(
        ['packages/react-query/src/a.ts', 'packages/server/package.json'],
        packages,
      ),
    ).toEqual(['@trpc/server', '@trpc/react-query']);
  });
});

describe('noteSection', () => {
  it('sorts conventional commits by type', () => {
    expect(noteSection('feat(server): a')).toBe('feat');
    expect(noteSection('fix: a')).toBe('fix');
    expect(noteSection('perf(client): a')).toBe('perf');
    expect(noteSection('feat(server)!: a')).toBe('breaking');
    expect(noteSection('fix!: a')).toBe('breaking');
    expect(noteSection('Fix(client): a')).toBe('fix');
    expect(noteSection('wip(server): a')).toBe('other');
    expect(noteSection('Update the wsLink')).toBe('other');
  });
});

describe('renderNotes', () => {
  it('groups by package, then by type, and skips what changes no package', () => {
    expect(
      notes(
        [
          change('a1', 'fix(server): a (#1)', ['packages/server/src/a.ts']),
          change('a2', 'feat(www): sponsors (#2)', [
            'www/src/sponsors.tsx',
            'packages/server/README.md',
            'packages/client/README.md',
          ]),
          change('a3', 'feat(client): b (#3)', ['packages/client/src/b.ts']),
          change('a4', 'perf(server): c (#4)', ['packages/server/src/c.ts']),
          change('a5', 'chore: bump the examples (#5)', [
            'examples/next/package.json',
          ]),
          change('a6', 'fix(client): d (#6)', ['packages/client/src/d.ts']),
        ],
        github([
          pr(1, 'fix(server): a'),
          pr(2, 'feat(www): sponsors'),
          pr(3, 'feat(client): b', 'someone'),
          pr(4, 'perf(server): c'),
          pr(5, 'chore: bump the examples'),
          pr(6, 'fix(client): d'),
        ]),
      ),
    ).toBe(`## @trpc/server

### Fixes

* fix(server): a by @KATT in ${prUrl(1)}

### Performance

* perf(server): c by @KATT in ${prUrl(4)}

## @trpc/client

### Features

* feat(client): b by @someone in ${prUrl(3)}

### Fixes

* fix(client): d by @KATT in ${prUrl(6)}

**Full Changelog**: https://github.com/trpc/trpc/compare/v11.24.0...v11.24.1
`);
  });

  it('lists a pull request under each package it changes', () => {
    const rendered = notes(
      [
        change('a1', 'fix: shared (#1)', [
          'packages/client/src/a.ts',
          'packages/react-query/src/a.ts',
        ]),
      ],
      github([pr(1, 'fix: shared')]),
    );
    expect(rendered).toContain(
      `## @trpc/client\n\n### Fixes\n\n* fix: shared by @KATT in ${prUrl(1)}`,
    );
    expect(rendered).toContain(
      `## @trpc/react-query\n\n### Fixes\n\n* fix: shared by @KATT in ${prUrl(1)}`,
    );
    expect(rendered).not.toContain('## @trpc/server');
  });

  it('puts breaking changes first and unconventional titles last', () => {
    expect(
      notes(
        [
          change('a1', 'Tidy things (#1)', ['packages/server/src/a.ts']),
          change('a2', 'fix(server): a (#2)', ['packages/server/src/a.ts']),
          change('a3', 'feat(server)!: drop node 18 (#3)', [
            'packages/server/src/a.ts',
          ]),
        ],
        github([
          pr(1, 'Tidy things'),
          pr(2, 'fix(server): a'),
          pr(3, 'feat(server)!: drop node 18'),
        ]),
      ).match(/^###? .*$/gm),
    ).toEqual([
      '## @trpc/server',
      '### Breaking Changes',
      '### Fixes',
      '### Other Changes',
    ]);
  });

  it("uses GitHub's title, and the commit when there's no pull request", () => {
    expect(
      notes(
        [
          change('a1', 'fix(client): old title (#1)', [
            'packages/client/src/a.ts',
          ]),
          change('a2', 'fix(client): pushed directly', [
            'packages/client/src/b.ts',
          ]),
          change('a3', 'fix(client): a ghost (#3)', [
            'packages/client/src/c.ts',
          ]),
        ],
        github(
          [
            pr(1, 'fix(client): new title'),
            { ...pr(3, 'fix(client): a ghost'), author: undefined },
          ],
          { a2: 'someone' },
        ),
      ),
    ).toContain(
      [
        `* fix(client): new title by @KATT in ${prUrl(1)}`,
        `* fix(client): pushed directly by @someone in https://github.com/trpc/trpc/commit/a2`,
        `* fix(client): a ghost in ${prUrl(3)}`,
      ].join('\n'),
    );
  });

  it('skips release commits', () => {
    const bump = [
      'packages/server/package.json',
      'packages/client/package.json',
    ];
    expect(
      notes(
        [
          change('a1', 'chore: release v11.24.1', bump),
          change('a2', 'v11.24.0', bump),
          change('a3', 'v11.24.0-canary.1', bump),
        ],
        github([]),
      ),
    ).toMatch(/^No changes to the published packages\./);
  });

  it('merges commits of the same pull request', () => {
    const rendered = notes(
      [
        change('a1', 'fix: a (#1)', ['packages/client/src/a.ts']),
        change('a2', 'fix: a (#1)', ['packages/server/src/a.ts']),
      ],
      github([pr(1, 'fix: a')]),
    );
    expect(rendered.match(/fix: a by/g)).toHaveLength(2);
    expect(rendered.indexOf('@trpc/server')).toBeLessThan(
      rendered.indexOf('@trpc/client'),
    );
  });

  it('credits new contributors whose first pull request is listed', () => {
    expect(
      notes(
        [
          change('a1', 'fix(server): a (#1)', ['packages/server/src/a.ts']),
          change('a2', 'fix(www): b (#2)', ['www/src/b.tsx']),
        ],
        github([
          pr(1, 'fix(server): a', 'newbie'),
          pr(2, 'fix(www): b', 'other'),
        ]),
        [
          { login: 'newbie', url: prUrl(1) },
          { login: 'other', url: prUrl(2) },
        ],
      ),
    ).toContain(
      `## New Contributors\n\n* @newbie made their first contribution in ${prUrl(1)}\n\n**Full Changelog**`,
    );
  });

  it('says so when no package changed', () => {
    expect(
      notes(
        [change('a1', 'feat(www): a (#1)', ['www/src/a.tsx'])],
        github([pr(1, 'feat(www): a')]),
      ),
    ).toBe(
      'No changes to the published packages.\n\n**Full Changelog**: https://github.com/trpc/trpc/compare/v11.24.0...v11.24.1\n',
    );
  });
});

describe('parseNewContributors', () => {
  it("reads GitHub's generated notes", () => {
    expect(
      parseNewContributors(`## What's Changed
* fix: a by @a in https://github.com/trpc/trpc/pull/1

## New Contributors
* @a made their first contribution in https://github.com/trpc/trpc/pull/1
* @b-c made their first contribution in https://github.com/trpc/trpc/pull/2

**Full Changelog**: https://github.com/trpc/trpc/compare/v1.0.0...v1.0.1`),
    ).toEqual([
      { login: 'a', url: 'https://github.com/trpc/trpc/pull/1' },
      { login: 'b-c', url: 'https://github.com/trpc/trpc/pull/2' },
    ]);
  });
});

describe('changesBetween', () => {
  it('lists first-parent commits with their files, oldest first', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const commit = (message: string, files: ReadonlyArray<string>) =>
          Effect.gen(function* () {
            for (const file of files) {
              yield* fs.makeDirectory(path.dirname(path.join(root, file)), {
                recursive: true,
              });
              yield* fs.writeFileString(path.join(root, file), message);
            }
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
            return yield* git(root, 'rev-parse', 'HEAD');
          });
        yield* git(root, 'init', '--quiet', '--initial-branch', 'main');
        yield* commit('initial', ['packages/server/src/a.ts']);
        yield* git(root, 'tag', '--no-sign', 'v1.0.0');
        const a = yield* commit('fix(server): a (#1)', [
          'packages/server/src/a.ts',
          'packages/server/README.md',
        ]);
        const b = yield* commit('feat(www): b (#2)', ['www/b.tsx']);
        const c = yield* commit('chore: empty', []);
        yield* git(root, 'checkout', '--quiet', '-b', 'feature');
        yield* commit('feat(server): feature', [
          'packages/server/src/feature.ts',
          'packages/server/src/café.ts',
        ]);
        yield* git(root, 'checkout', '--quiet', 'main');
        yield* git(
          root,
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.com',
          'merge',
          '--quiet',
          '--no-ff',
          '--message',
          'Merge pull request #3 from someone/feature',
          'feature',
        );
        const d = yield* git(root, 'rev-parse', 'HEAD');

        expect(yield* changesBetween(root, 'v1.0.0', 'HEAD')).toEqual([
          {
            sha: a,
            subject: 'fix(server): a (#1)',
            files: ['packages/server/README.md', 'packages/server/src/a.ts'],
          },
          { sha: b, subject: 'feat(www): b (#2)', files: ['www/b.tsx'] },
          { sha: c, subject: 'chore: empty', files: [] },
          {
            sha: d,
            subject: 'Merge pull request #3 from someone/feature',
            files: [
              'packages/server/src/café.ts',
              'packages/server/src/feature.ts',
            ],
          },
        ]);
        expect(yield* changesBetween(root, 'HEAD', 'HEAD')).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    ));
});

describe('notesPackages', () => {
  it('reads the public packages at a revision, not the working tree', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const write = (dir: string, pkg: object) =>
          Effect.gen(function* () {
            yield* fs.makeDirectory(path.join(root, 'packages', dir), {
              recursive: true,
            });
            yield* fs.writeFileString(
              path.join(root, 'packages', dir, 'package.json'),
              JSON.stringify(pkg),
            );
          });
        const commit = git(
          root,
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.com',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '--quiet',
          '--all',
          '--message',
          'packages',
        );
        yield* git(root, 'init', '--quiet', '--initial-branch', 'main');
        yield* write('client', {
          name: '@trpc/client',
          dependencies: { '@trpc/server': 'workspace:*' },
        });
        yield* write('server', { name: '@trpc/server' });
        yield* write('tests', { name: '@trpc/tests', private: true });
        yield* git(root, 'add', '--all');
        yield* commit;
        yield* git(root, 'tag', '--no-sign', 'v1.0.0');
        yield* write('client', { name: '@trpc/client', private: true });
        yield* commit;
        yield* write('server', { name: '@trpc/renamed' });

        expect(yield* notesPackages(root, 'v1.0.0')).toEqual([
          { name: '@trpc/server', dir: 'packages/server' },
          { name: '@trpc/client', dir: 'packages/client' },
        ]);
        expect(yield* notesPackages(root, 'HEAD')).toEqual([
          { name: '@trpc/server', dir: 'packages/server' },
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    ));
});
