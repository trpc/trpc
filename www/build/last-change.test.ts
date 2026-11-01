import { describe, expect, it } from 'vitest';

import {
  type Commit,
  lastChangesOf,
  parseChanged,
  parseNameStatus,
} from './last-change.ts';

const page = 'www/v11/docs/server/procedures.md';
const old = 'www/docs/server/procedures.mdx';

/** Commits, newest first, each changing its files' content. */
const changing = (commits: ReadonlyArray<Commit>) =>
  new Map(
    commits.map((commit) => [
      commit.sha,
      new Set(commit.files.map((file) => file.path)),
    ]),
  );

describe('lastChangesOf', () => {
  it("takes a copied page's date from the file it was copied from, not the copy", () => {
    const commits: ReadonlyArray<Commit> = [
      {
        date: '2026-11-01',
        files: [
          { path: page, status: 'A' },
          { path: old, status: 'D' },
        ],
        sha: 'port',
      },
      { date: '2026-03-08', files: [{ path: old, status: 'M' }], sha: 'edit' },
    ];
    expect(
      lastChangesOf({
        changed: changing(commits),
        commits,
        files: [page],
        sources: new Map([[page, [old]]]),
      }),
    ).toEqual(new Map([[page, '2026-03-08']]));
  });

  it('follows a rename without counting it, and counts an edit after the move', () => {
    const commits: ReadonlyArray<Commit> = [
      {
        date: '2026-12-01',
        files: [{ path: page, status: 'M' }],
        sha: 'later',
      },
      {
        date: '2026-11-01',
        files: [{ from: old, path: page, status: 'R087' }],
        sha: 'port',
      },
      { date: '2026-03-08', files: [{ path: old, status: 'M' }], sha: 'edit' },
    ];
    const options = {
      changed: changing(commits),
      commits,
      files: [page],
      sources: new Map<string, ReadonlyArray<string>>(),
    };
    expect(lastChangesOf(options)).toEqual(new Map([[page, '2026-12-01']]));
    expect(lastChangesOf({ ...options, commits: commits.slice(1) })).toEqual(
      new Map([[page, '2026-03-08']]),
    );
  });

  it('skips whitespace-only changes and the listed commits', () => {
    const commits: ReadonlyArray<Commit> = [
      { date: '2026-11-02', files: [{ path: page, status: 'M' }], sha: 'fmt' },
      { date: '2026-11-01', files: [{ path: page, status: 'M' }], sha: 'lint' },
      { date: '2026-03-08', files: [{ path: page, status: 'A' }], sha: 'add' },
    ];
    expect(
      lastChangesOf({
        changed: new Map([
          ['fmt', new Set<string>()],
          ['lint', new Set([page])],
          ['add', new Set([page])],
        ]),
        commits,
        files: [page],
        skip: new Set(['lint']),
        sources: new Map(),
      }),
    ).toEqual(new Map([[page, '2026-03-08']]));
  });

  it('gives no date to a page whose only commits are copies', () => {
    const commits: ReadonlyArray<Commit> = [
      { date: '2026-11-01', files: [{ path: page, status: 'A' }], sha: 'port' },
    ];
    expect(
      lastChangesOf({
        changed: changing(commits),
        commits,
        files: [page],
        sources: new Map([[page, [old]]]),
      }).size,
    ).toBe(0);
  });
});

describe('parsing git log', () => {
  it('reads names and statuses, renames with both names', () => {
    expect(
      parseNameStatus(
        `\0abc 2026-03-08T09:14:02+00:00\n\nM\t${old}\nR087\t${old}\t${page}\n`,
      ),
    ).toEqual([
      {
        date: '2026-03-08T09:14:02+00:00',
        files: [
          { path: old, status: 'M' },
          { from: old, path: page, status: 'R087' },
        ],
        sha: 'abc',
      },
    ]);
  });

  it('reads the files a commit changed more than whitespace of', () => {
    expect(parseChanged(`\0abc\n\n0\t0\t${old}\n2\t1\t${page}\n`)).toEqual(
      new Map([['abc', new Set([page])]]),
    );
  });
});
