import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import { describe, expect, it } from 'vitest';
import { git } from './command.ts';
import {
  noteSection,
  notesPackages,
  notesEntries,
  parseNewContributors,
  pullRequestNumber,
  renderNotes,
  scopedPackages,
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
  {
    dir: 'packages/tanstack-react-query',
    name: '@trpc/tanstack-react-query',
  },
  { dir: 'packages/upgrade', name: '@trpc/upgrade' },
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
  changed: ReadonlyArray<string>,
): Change => ({ sha, subject, packages: changed });

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
    expect(pullRequestNumber('  Merge pull request #7 from a/b')).toBe(7);
    expect(pullRequestNumber('Merge branch main into feature')).toBeUndefined();
  });
});

describe('scopedPackages', () => {
  it('reads the packages a scope names, by directory or name', () => {
    expect(scopedPackages('feat(client): a', packages)).toEqual([
      '@trpc/client',
    ]);
    expect(scopedPackages('feat(Client)!: a', packages)).toEqual([
      '@trpc/client',
    ]);
    expect(scopedPackages('fix(`@trpc/upgrade`): a', packages)).toEqual([
      '@trpc/upgrade',
    ]);
    expect(
      scopedPackages('fix(tanstack-react-query): a (#1)', packages),
    ).toEqual(['@trpc/tanstack-react-query']);
  });

  it('reads several, in the given order', () => {
    expect(scopedPackages('fix(client,server): a', packages)).toEqual([
      '@trpc/server',
      '@trpc/client',
    ]);
    expect(scopedPackages('fix(upgrade, server): a', packages)).toEqual([
      '@trpc/server',
      '@trpc/upgrade',
    ]);
    expect(
      scopedPackages(
        'fix(`react-query` + `tanstack-react-query`): a',
        packages,
      ),
    ).toEqual(['@trpc/react-query', '@trpc/tanstack-react-query']);
    expect(scopedPackages('fix(server, www): a', packages)).toEqual([
      '@trpc/server',
    ]);
  });

  it('reads none without a scope naming a public package', () => {
    expect(scopedPackages('fix: a', packages)).toEqual([]);
    expect(scopedPackages('fix(deps): a', packages)).toEqual([]);
    expect(scopedPackages('chore(www): a', packages)).toEqual([]);
    expect(scopedPackages('fix(tests): a', packages)).toEqual([]);
    expect(scopedPackages('fix(tanstack-react-quey): a', packages)).toEqual([]);
    expect(scopedPackages('Update the client (server)', packages)).toEqual([]);
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
          change('a1', 'fix(server): a (#1)', ['@trpc/server']),
          change('a2', 'feat(www): sponsors (#2)', []),
          change('a3', 'feat(client): b (#3)', ['@trpc/client']),
          change('a4', 'perf(server): c (#4)', ['@trpc/server']),
          change('a5', 'chore: bump the examples (#5)', []),
          change('a6', 'fix(client): d (#6)', ['@trpc/client']),
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

  it('lists a pull request only under the packages its scope names', () => {
    const rendered = notes(
      [
        change('a1', 'feat(client): async iterable subscribe (#1)', [
          '@trpc/server',
          '@trpc/client',
          '@trpc/tanstack-react-query',
        ]),
        change('a2', 'fix(server,react-query): b (#2)', ['@trpc/server']),
      ],
      github([
        pr(1, 'feat(client): async iterable subscribe'),
        pr(2, 'fix(server,react-query): b'),
      ]),
    );
    expect(rendered.match(/^## .*$/gm)).toEqual([
      '## @trpc/server',
      '## @trpc/client',
      '## @trpc/react-query',
    ]);
    expect(rendered.match(/async iterable subscribe/g)).toHaveLength(1);
    expect(rendered.match(/react-query\): b/g)).toHaveLength(2);
  });

  it("goes by GitHub's title over the commit's", () => {
    expect(
      notes(
        [change('a1', 'fix: a (#1)', ['@trpc/server'])],
        github([pr(1, 'fix(client): a')]),
      ).match(/^## .*$/gm),
    ).toEqual(['## @trpc/client']);
  });

  it('skips a scoped pull request that changes no public package', () => {
    expect(
      notes(
        [
          change('a1', 'docs(server): a (#1)', []),
          change('a2', 'chore(client): bump the examples (#2)', []),
        ],
        github([
          pr(1, 'docs(server): a'),
          pr(2, 'chore(client): bump the examples'),
        ]),
      ),
    ).toMatch(/^No changes to the published packages\./);
  });

  it('lists a pull request whose scope names no package under each package it changes', () => {
    const rendered = notes(
      [
        change('a1', 'fix: shared (#1)', ['@trpc/client', '@trpc/react-query']),
        change('a2', 'fix(deps): bump zod (#2)', ['@trpc/server']),
      ],
      github([pr(1, 'fix: shared'), pr(2, 'fix(deps): bump zod')]),
    );
    expect(rendered).toContain(
      `## @trpc/client\n\n### Fixes\n\n* fix: shared by @KATT in ${prUrl(1)}`,
    );
    expect(rendered).toContain(
      `## @trpc/react-query\n\n### Fixes\n\n* fix: shared by @KATT in ${prUrl(1)}`,
    );
    expect(rendered).toContain(
      `## @trpc/server\n\n### Fixes\n\n* fix(deps): bump zod by @KATT in ${prUrl(2)}`,
    );
    expect(rendered.match(/^## .*$/gm)).toHaveLength(3);
  });

  it('lists maintenance whose scope names no package once, after the packages', () => {
    // v11.26.0 and v11.27.0 listed a chore(deps) under every package.
    const rendered = notes(
      [
        change('a1', 'chore(deps): shared versions in the catalog (#1)', [
          '@trpc/server',
          '@trpc/client',
          '@trpc/react-query',
        ]),
        change('a2', 'fix(client): a (#2)', ['@trpc/client']),
        change('a3', 'ci: b (#3)', ['@trpc/server']),
        change('a4', 'chore(client): c (#4)', ['@trpc/client']),
        change('a5', 'chore(deps)!: drop node 18 (#5)', ['@trpc/server']),
      ],
      github([
        pr(1, 'chore(deps): shared versions in the catalog'),
        pr(2, 'fix(client): a'),
        pr(3, 'ci: b'),
        pr(4, 'chore(client): c'),
        pr(5, 'chore(deps)!: drop node 18'),
      ]),
    );
    expect(rendered).toBe(`## @trpc/server

### Breaking Changes

* chore(deps)!: drop node 18 by @KATT in ${prUrl(5)}

## @trpc/client

### Fixes

* fix(client): a by @KATT in ${prUrl(2)}

### Chores

* chore(client): c by @KATT in ${prUrl(4)}

## Maintenance

### CI

* ci: b by @KATT in ${prUrl(3)}

### Chores

* chore(deps): shared versions in the catalog by @KATT in ${prUrl(1)}

**Full Changelog**: https://github.com/trpc/trpc/compare/v11.24.0...v11.24.1
`);
  });

  it('puts breaking changes first and unconventional titles last', () => {
    expect(
      notes(
        [
          change('a1', 'Tidy things (#1)', ['@trpc/server']),
          change('a2', 'fix(server): a (#2)', ['@trpc/server']),
          change('a3', 'feat(server)!: drop node 18 (#3)', ['@trpc/server']),
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
          change('a1', 'fix(client): old title (#1)', ['@trpc/client']),
          change('a2', 'fix(client): pushed directly', ['@trpc/client']),
          change('a3', 'fix(client): a ghost (#3)', ['@trpc/client']),
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
    const bump = ['@trpc/server', '@trpc/client'];
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
        change('a1', 'fix: a (#1)', ['@trpc/client']),
        change('a2', 'fix: a (#1)', ['@trpc/server']),
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
          change('a1', 'fix(server): a (#1)', ['@trpc/server']),
          change('a2', 'fix(www): b (#2)', []),
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
        [change('a1', 'feat(www): a (#1)', [])],
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
          'initial',
        );
        yield* git(root, 'tag', '--no-sign', 'v0.0.0');
        yield* write('café', { name: '@trpc/cafe' });
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

        expect(yield* notesPackages(root, 'v0.0.0')).toEqual([]);
        expect(yield* notesPackages(root, 'v1.0.0')).toEqual([
          { name: '@trpc/cafe', dir: 'packages/café' },
          { name: '@trpc/server', dir: 'packages/server' },
          { name: '@trpc/client', dir: 'packages/client' },
        ]);
        expect(yield* notesPackages(root, 'HEAD')).toEqual([
          { name: '@trpc/cafe', dir: 'packages/café' },
          { name: '@trpc/server', dir: 'packages/server' },
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    ));
});
