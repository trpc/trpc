/**
 * When each page's content last changed, from git, for the sitemap's
 * `lastmod` and the page's `article:modified`: the newest commit that changed
 * what the file says, following its renames, and before the move to this site
 * the Docusaurus files it was copied from (`old-docs.json`).
 *
 * Commits that only move, rename or reformat files don't count: renames,
 * deletions, whitespace-only changes, the copy that wrote a copied page, and
 * `notContentChanges`. A page without a date has no `lastmod`, rather than the
 * build's, and without the history (a shallow clone that can't fetch the rest)
 * no page has one.
 */
import { Effect, FileSystem, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { site } from '../src/site.ts';

/** Commits that touched pages without changing what they say. */
export const notContentChanges: ReadonlySet<string> = new Set([
  // chore: replace ESLint and Prettier with oxlint and oxfmt (#7765)
  'a81bba207211fc70c449a13a56407799c72c53c6',
  // chore: switch to eslint-config-prettier from eslint-plugin-prettier (#3501)
  '495f18e7a7d4d0f4fe069b5d8ef7e7498c60861b',
  // fix(deps): update dependency @ianvs/prettier-plugin-sort-imports to v4 (#4432)
  'ab27bf9a8853f4a6206201221d1140402f6cd2b6',
  // chore: add prettier-plugin-tailwindcss & eslint cache (#4114)
  '663c63ea80e2de267d8d4708f88c1d38a598ab6e',
  // chore: rename `next`-branch -> `main` (#6619)
  '159a03c62834d942e36068341c12a3d88b98abfa',
  // chore(www): bump docusaurus (#6051), which rewrote the posts' frontmatter
  'f8e8d1715c164357239170fc6668de9f2b579b7d',
  // chore(www): version docs (#5287), which copied the v10 docs
  '12e6a3b75bbc6141e67176ca2beeac2d176574ac',
  // feat(docs): add versioning (#2224), which copied the v9 docs
  '5a3d751ae676d0a8785a45d1a8bfc99769fdb480',
  // Move doc pages into sensible HTTP folders matching doc categories (#4026)
  'bcf01ddb5dc6ca968bb659364b4f64fd58469f1b',
  // The move to this site, before it was squashed.
  'b09d7f2bf8da54effb590b1fc4f3fef95d6d5720',
  '9d274c6d98156a8bed0ac11d0a45350e2468360c',
]);

/** A commit of `git log --name-status`, newest first. */
export interface Commit {
  readonly date: string;
  readonly files: ReadonlyArray<{
    /** The file's name before the commit, for a rename. */
    readonly from?: string | undefined;
    readonly path: string;
    readonly status: string;
  }>;
  readonly sha: string;
}

/** `git log --format=%x00%H %cI --name-status` as commits. */
export function parseNameStatus(log: string): ReadonlyArray<Commit> {
  return log
    .split('\0')
    .slice(1)
    .map((commit) => {
      const [header = '', ...lines] = commit.split('\n');
      const [sha = '', date = ''] = header.split(' ');
      const files = lines
        .filter((line) => line !== '')
        .map((line) => {
          const [status = '', first = '', second] = line.split('\t');
          return second === undefined
            ? { path: first, status }
            : { from: first, path: second, status };
        });
      return { date, files, sha };
    });
}

/** `git log -w --no-renames --format=%x00%H --numstat`: the files each commit changed more than whitespace of. */
export function parseChanged(
  log: string,
): ReadonlyMap<string, ReadonlySet<string>> {
  const changed = new Map<string, ReadonlySet<string>>();
  for (const commit of log.split('\0').slice(1)) {
    const [sha = '', ...lines] = commit.split('\n');
    const files = new Set<string>();
    for (const line of lines) {
      const [added = '', deleted = '', file] = line.split('\t');
      if (file !== undefined && `${added}${deleted}` !== '00') {
        files.add(file);
      }
    }
    changed.set(sha, files);
  }
  return changed;
}

/**
 * Each file's last content change, by the name `files` gives it: `sources`
 * are the names its content had before the move (copied, not renamed), and
 * its own adding then doesn't count.
 */
export function lastChangesOf(options: {
  readonly changed: ReadonlyMap<string, ReadonlySet<string>>;
  readonly commits: ReadonlyArray<Commit>;
  readonly files: ReadonlyArray<string>;
  readonly skip?: ReadonlySet<string>;
  readonly sources: ReadonlyMap<string, ReadonlyArray<string>>;
}): ReadonlyMap<string, string> {
  const skip = options.skip ?? notContentChanges;
  /** The name each file had at the commit being read, to the files. */
  const pending = new Map<string, Set<string>>();
  const track = (name: string, files: Iterable<string>) => {
    const tracked = pending.get(name) ?? new Set();
    for (const file of files) {
      tracked.add(file);
    }
    pending.set(name, tracked);
  };
  const copies = new Set<string>();
  for (const file of options.files) {
    track(file, [file]);
    const sources = options.sources.get(file) ?? [];
    if (sources.length > 0) {
      copies.add(file);
    }
    for (const source of sources) {
      track(source, [file]);
    }
  }
  const dates = new Map<string, string>();
  for (const commit of options.commits) {
    const changed = options.changed.get(commit.sha);
    const counts = (name: string) =>
      !skip.has(commit.sha) && (changed?.has(name) ?? true);
    for (const file of commit.files) {
      const files = pending.get(file.path);
      if (files === undefined) {
        continue;
      }
      if (file.status.startsWith('R') && file.from !== undefined) {
        pending.delete(file.path);
        track(file.from, files);
        continue;
      }
      const added = file.status === 'A';
      if (
        (added && !copies.has(file.path) && counts(file.path)) ||
        (file.status === 'M' && counts(file.path))
      ) {
        for (const target of files) {
          if (!dates.has(target)) {
            dates.set(target, commit.date);
          }
        }
      }
      if (added) {
        pending.delete(file.path);
      }
    }
  }
  return dates;
}

const OldDocs = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Array(Schema.String)]),
);

/** Each page's last content change, by absolute path, for the pages `files` names (absolute). */
export const lastChanges = Effect.fn('lastChanges')(
  function* (wwwDir: string, files: ReadonlyArray<string>) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const git = (args: ReadonlyArray<string>) =>
      spawner.string(
        ChildProcess.make('git', ['-c', 'core.quotePath=false', ...args], {
          cwd: wwwDir,
          stderr: 'ignore',
        }),
      );
    const shallow = () =>
      Effect.map(
        git(['rev-parse', '--is-shallow-repository']),
        (out) => out.trim() === 'true',
      );
    if (yield* shallow()) {
      // Vercel clones a few commits deep, without an `origin` to fetch the
      // rest from; the repo is public.
      for (const remote of ['origin', `${site.github}.git`]) {
        if (yield* shallow()) {
          yield* git([
            'fetch',
            '--unshallow',
            '--no-tags',
            '--quiet',
            remote,
          ]).pipe(Effect.ignore);
        }
      }
      if (yield* shallow()) {
        yield* Effect.logWarning(
          "The clone is shallow and couldn't fetch the rest of its history, so no page has a last-modified date.",
        );
        return new Map<string, string>();
      }
    }
    const root = (yield* git(['rev-parse', '--show-toplevel'])).trim();
    const www = path.relative(root, wwwDir).split(path.sep).join('/');
    const relative = (file: string) =>
      path.relative(root, file).split(path.sep).join('/');
    const oldDocs = yield* fs
      .readFileString(path.join(wwwDir, 'old-docs.json'))
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.fromJsonString(OldDocs)),
        ),
      );
    const sources = new Map<string, Array<string>>();
    for (const [from, to] of Object.entries(oldDocs)) {
      for (const copy of typeof to === 'string' ? [] : to) {
        const name = `${www}/${copy}`;
        sources.set(name, [...(sources.get(name) ?? []), `${www}/${from}`]);
      }
    }
    const [names, changed] = yield* Effect.all(
      [
        git(['log', '-M', '--format=%x00%H %cI', '--name-status', '--', '.']),
        git([
          'log',
          '-w',
          '--no-renames',
          '--format=%x00%H',
          '--numstat',
          '--',
          '.',
        ]),
      ],
      { concurrency: 'unbounded' },
    );
    const dates = lastChangesOf({
      changed: parseChanged(changed),
      commits: parseNameStatus(names),
      files: files.map(relative),
      sources,
    });
    return new Map(
      files.flatMap((file) => {
        const date = dates.get(relative(file));
        return date === undefined ? [] : [[file, date] as const];
      }),
    );
  },
  Effect.catch((error) =>
    Effect.as(
      Effect.logWarning(
        `No page has a last-modified date: reading git's history failed: ${String(error)}`,
      ),
      new Map<string, string>() as ReadonlyMap<string, string>,
    ),
  ),
);
