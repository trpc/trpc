/**
 * The notes of a stable release's GitHub release: the pull requests since the
 * previous tag, under each public package their conventional-commit scope
 * names, then by their type.
 *
 * A pull request changes a package when its commit changes a file in the
 * package's directory other than Markdown: READMEs change with every
 * sponsor update. Pull requests that change no public package, like the
 * website, tooling or examples, aren't listed. A listed pull request goes
 * under the packages its scope names, like `client` in `feat(client): a` or
 * both in `fix(server, client): a`, so a client feature that also touches
 * the server's types is only a client feature. Without a scope, or with one
 * that names no public package, like `deps`, it goes under each package it
 * changes. GitHub works out who contributed for the first time.
 */
import { Effect } from 'effect';
import { git, output } from './command.ts';
import type { PackageJson } from './version.ts';
import { publishedVersions, type WorkspacePackage } from './workspace.ts';

/** A commit on the released branch's first-parent history. */
export interface Change {
  readonly sha: string;
  readonly subject: string;
  readonly files: ReadonlyArray<string>;
}

/** A public package, in the order its section appears. */
export interface NotesPackage {
  /** Relative to the repo root, e.g. `packages/server`. */
  readonly dir: string;
  readonly name: string;
}

export interface PullRequest {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  /** `undefined` when the author's account is gone. */
  readonly author: string | undefined;
}

/** What GitHub knows about the commits of a release. */
export interface GitHubInfo {
  readonly pullRequests: ReadonlyMap<number, PullRequest>;
  /** Logins of the commits' authors, for entries GitHub has no pull request for. */
  readonly commitAuthors: ReadonlyMap<string, string>;
}

export interface NotesEntry {
  readonly title: string;
  /** The pull request, or the commit when there's none. */
  readonly url: string;
  readonly author: string | undefined;
  readonly packages: ReadonlyArray<string>;
}

export interface NewContributor {
  readonly login: string;
  /** Their first pull request. */
  readonly url: string;
}

/**
 * The pull request a commit's subject names: a squash merge's `fix: a
 * (#123)`, or a merge commit's `Merge pull request #123 from owner/branch`.
 */
export function pullRequestNumber(subject: string): number | undefined {
  const trimmed = subject.trim();
  const match =
    /\(#(\d+)\)$/.exec(trimmed) ??
    /^Merge pull request #(\d+) from /.exec(trimmed);
  return match === null ? undefined : Number(match[1]);
}

/**
 * Whether `subject` is a release commit's, which only bumps versions:
 * `chore: release v11.24.1`, or `v11.24.0` from before `pnpm release`.
 */
export function isReleaseCommit(subject: string) {
  return /^(chore: release )?v\d+\.\d+\.\d+(-\S+)?$/.test(subject.trim());
}

/** The names of the packages `files` change, in `packages` order. */
export function changedPackages(
  files: ReadonlyArray<string>,
  packages: ReadonlyArray<NotesPackage>,
): ReadonlyArray<string> {
  return packages
    .filter(({ dir }) =>
      files.some(
        (file) =>
          file.startsWith(`${dir}/`) && !file.toLowerCase().endsWith('.md'),
      ),
    )
    .map(({ name }) => name);
}

/**
 * The names of the packages the conventional-commit scope of `title` names,
 * in `packages` order. A scope names a package by its directory, like
 * `tanstack-react-query`, or its name, like `@trpc/upgrade`, and can name
 * several: `a,b`, `a, b` or `` `a` + `b` ``.
 */
export function scopedPackages(
  title: string,
  packages: ReadonlyArray<NotesPackage>,
): ReadonlyArray<string> {
  const scope = /^\w+\(([^)]*)\)!?:/.exec(title.trim())?.[1];
  if (scope === undefined) {
    return [];
  }
  const named = new Set(
    scope
      .split(/[,+]/)
      .map((part) => part.trim().replace(/^`|`$/g, '').toLowerCase()),
  );
  return packages
    .filter(
      ({ dir, name }) =>
        named.has(name.toLowerCase()) ||
        named.has(dir.split('/').at(-1)?.toLowerCase() ?? ''),
    )
    .map(({ name }) => name);
}

const sections = [
  ['breaking', 'Breaking Changes'],
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
  ['revert', 'Reverts'],
  ['refactor', 'Refactors'],
  ['docs', 'Documentation'],
  ['types', 'Types'],
  ['test', 'Tests'],
  ['build', 'Build'],
  ['ci', 'CI'],
  ['chore', 'Chores'],
  ['style', 'Style'],
  ['other', 'Other Changes'],
] as const;

type Section = (typeof sections)[number][0];

/**
 * The section of a conventional-commit title: `!` before the colon is a
 * breaking change, and a type not in `sections`, or no type, is another
 * change.
 */
export function noteSection(title: string): Section {
  const match = /^(\w+)(?:\([^)]*\))?(!)?:/.exec(title);
  if (match === null) {
    return 'other';
  }
  if (match[2] === '!') {
    return 'breaking';
  }
  const type = match[1]?.toLowerCase();
  return sections.find(([key]) => key === type)?.[0] ?? 'other';
}

/**
 * The entries of the notes, oldest first: the changes that change a public
 * package, one per pull request, titled and credited the way GitHub has
 * them, under the packages their title's scope names, or else the packages
 * they change.
 */
export function notesEntries(opts: {
  readonly changes: ReadonlyArray<Change>;
  readonly packages: ReadonlyArray<NotesPackage>;
  readonly github: GitHubInfo;
  readonly repo: string;
}): ReadonlyArray<NotesEntry> {
  const entries = new Map<string, NotesEntry>();
  for (const change of opts.changes) {
    const changed = changedPackages(change.files, opts.packages);
    if (changed.length === 0 || isReleaseCommit(change.subject)) {
      continue;
    }
    const number = pullRequestNumber(change.subject);
    const pr =
      number === undefined ? undefined : opts.github.pullRequests.get(number);
    const title = pr?.title ?? change.subject;
    const scoped = scopedPackages(title, opts.packages);
    const packages = scoped.length > 0 ? scoped : changed;
    const entry: NotesEntry =
      pr === undefined
        ? {
            title,
            url: `https://github.com/${opts.repo}/commit/${change.sha}`,
            author: opts.github.commitAuthors.get(change.sha),
            packages,
          }
        : { title, url: pr.url, author: pr.author, packages };
    const earlier = entries.get(entry.url);
    entries.set(
      entry.url,
      earlier === undefined
        ? entry
        : {
            ...earlier,
            packages: opts.packages
              .map(({ name }) => name)
              .filter(
                (name) =>
                  earlier.packages.includes(name) || packages.includes(name),
              ),
          },
    );
  }
  return [...entries.values()];
}

/** The `## New Contributors` of notes GitHub generated. */
export function parseNewContributors(
  generated: string,
): ReadonlyArray<NewContributor> {
  return [
    ...generated.matchAll(
      /^\* @(\S+) made their first contribution in (\S+)$/gm,
    ),
  ].map(([, login = '', url = '']) => ({ login, url }));
}

const bullet = ({ title, url, author }: NotesEntry) =>
  `* ${title}${author === undefined ? '' : ` by @${author}`} in ${url}`;

/**
 * The notes' Markdown: a `## <package>` for each package `entries` list, in
 * `packages` order, with a `### <type>` for each type; then the new
 * contributors whose first pull request is listed, and the full changelog.
 */
export function renderNotes(opts: {
  readonly entries: ReadonlyArray<NotesEntry>;
  readonly packages: ReadonlyArray<NotesPackage>;
  readonly newContributors: ReadonlyArray<NewContributor>;
  readonly repo: string;
  readonly previousTag: string;
  readonly tag: string;
}): string {
  const blocks: Array<string> = [];
  for (const { name } of opts.packages) {
    const entries = opts.entries.filter(({ packages }) =>
      packages.includes(name),
    );
    if (entries.length === 0) {
      continue;
    }
    blocks.push(`## ${name}`);
    for (const [section, heading] of sections) {
      const listed = entries.filter(
        ({ title }) => noteSection(title) === section,
      );
      if (listed.length > 0) {
        blocks.push(`### ${heading}\n\n${listed.map(bullet).join('\n')}`);
      }
    }
  }
  if (blocks.length === 0) {
    blocks.push('No changes to the published packages.');
  }

  const listed = new Set(opts.entries.map(({ url }) => url));
  const newContributors = opts.newContributors.filter(({ url }) =>
    listed.has(url),
  );
  if (newContributors.length > 0) {
    blocks.push(
      `## New Contributors\n\n${newContributors
        .map(
          ({ login, url }) =>
            `* @${login} made their first contribution in ${url}`,
        )
        .join('\n')}`,
    );
  }

  blocks.push(
    `**Full Changelog**: https://github.com/${opts.repo}/compare/${opts.previousTag}...${opts.tag}`,
  );
  return `${blocks.join('\n\n')}\n`;
}

/** The commits in `from..to` on `to`'s first-parent history, oldest first. */
export const changesBetween = Effect.fn('changesBetween')(function* (
  root: string,
  from: string,
  to: string,
) {
  const log = yield* git(
    root,
    'log',
    '--first-parent',
    '--diff-merges=first-parent',
    '--no-renames',
    '--name-only',
    '--reverse',
    '-z',
    '--format=%x00%H%x00%s',
    `${from}..${to}`,
  );
  // With -z, every field ends with a NUL and paths aren't quoted. Each commit
  // starts with an empty field, which no path is, then its sha and subject; a
  // newline comes before its first path.
  const fields = log.split('\0');
  const changes: Array<Change & { files: Array<string> }> = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] ?? '';
    const current = changes.at(-1);
    if (field === '' && i + 2 < fields.length) {
      changes.push({
        sha: fields[i + 1] ?? '',
        subject: fields[i + 2] ?? '',
        files: [],
      });
      i += 2;
    } else if (field !== '' && current !== undefined) {
      current.files.push(
        current.files.length === 0 ? field.replace(/^\n/, '') : field,
      );
    }
  }
  return changes;
});

/** The public packages at `rev`, each after the packages it depends on. */
export const notesPackages = Effect.fn('notesPackages')(function* (
  root: string,
  rev: string,
) {
  const packages: Array<WorkspacePackage> = [];
  // Lists nothing when `rev` has no packages/ directory.
  const listed = yield* git(
    root,
    'ls-tree',
    '-z',
    '--name-only',
    rev,
    'packages/',
  );
  for (const dir of listed.split('\0').filter((entry) => entry !== '')) {
    const raw = yield* git(root, 'show', `${rev}:${dir}/package.json`).pipe(
      Effect.orElseSucceed(() => undefined),
    );
    const pkg =
      raw === undefined ? undefined : (JSON.parse(raw) as PackageJson);
    if (pkg?.name !== undefined) {
      packages.push({ dir, name: pkg.name, pkg });
    }
  }
  const dirs = new Map(packages.map(({ name, dir }) => [name, dir]));
  return [...publishedVersions(packages, '0.0.0').keys()].map(
    (name): NotesPackage => ({ name, dir: dirs.get(name) ?? '' }),
  );
});

interface GraphQLAuthor {
  readonly __typename: string;
  readonly login: string;
}

const login = (author: GraphQLAuthor | null | undefined) =>
  author == null
    ? undefined
    : author.__typename === 'Bot'
      ? `${author.login}[bot]`
      : author.login;

/** Looks the pull requests and commits of `changes` up on GitHub, in one query. */
const gitHubInfo = Effect.fn('gitHubInfo')(function* (
  root: string,
  repo: string,
  changes: ReadonlyArray<Change>,
) {
  const numbers = new Set<number>();
  const shas: Array<string> = [];
  for (const change of changes) {
    const number = pullRequestNumber(change.subject);
    if (number !== undefined) {
      numbers.add(number);
    }
    shas.push(change.sha);
  }
  if (numbers.size === 0 && shas.length === 0) {
    return { pullRequests: new Map(), commitAuthors: new Map() };
  }
  const author = 'author { __typename login }';
  const fields = [
    ...[...numbers].map(
      (number) =>
        `pr${number}: issueOrPullRequest(number: ${number}) { ... on PullRequest { number title url ${author} } }`,
    ),
    ...shas.map(
      (sha) =>
        `c${sha}: object(oid: "${sha}") { ... on Commit { author { user { login } } } }`,
    ),
  ];
  const [owner, name] = repo.split('/');
  const response = yield* output(root, 'gh', [
    'api',
    'graphql',
    '-f',
    `query=query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields.join(' ')} } }`,
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
  ]);
  const data = (
    JSON.parse(response) as {
      data: { repository: Record<string, Record<string, unknown> | null> };
    }
  ).data.repository;

  const pullRequests = new Map<number, PullRequest>();
  for (const number of numbers) {
    const pr = data[`pr${number}`] as
      | {
          number?: number;
          title: string;
          url: string;
          author: GraphQLAuthor | null;
        }
      | null
      | undefined;
    if (pr?.number !== undefined) {
      pullRequests.set(number, {
        number,
        title: pr.title,
        url: pr.url,
        author: login(pr.author),
      });
    }
  }
  const commitAuthors = new Map<string, string>();
  for (const sha of shas) {
    const commit = data[`c${sha}`] as
      | { author?: { user: { login: string } | null } }
      | null
      | undefined;
    const user = commit?.author?.user?.login;
    if (user !== undefined) {
      commitAuthors.set(sha, user);
    }
  }
  return { pullRequests, commitAuthors };
});

/**
 * The new contributors GitHub finds between `previousTag` and `tag`. Before
 * `tag` exists, GitHub reads up to `to`, which must be on GitHub.
 */
const newContributors = Effect.fn('newContributors')(function* (
  root: string,
  opts: {
    readonly repo: string;
    readonly previousTag: string;
    readonly tag: string;
    readonly to: string;
  },
) {
  const generated = yield* output(root, 'gh', [
    'api',
    '--method',
    'POST',
    `repos/${opts.repo}/releases/generate-notes`,
    '-f',
    `tag_name=${opts.tag}`,
    '-f',
    `previous_tag_name=${opts.previousTag}`,
    '-f',
    `target_commitish=${yield* git(root, 'rev-parse', `${opts.to}^{commit}`)}`,
    '--jq',
    '.body',
  ]);
  return parseNewContributors(generated);
});

/**
 * The notes of the release `tag` of `to`, from the commits since
 * `previousTag`. `repo` defaults to the one `gh` finds for `root`.
 */
export const releaseNotes = Effect.fn('releaseNotes')(function* (
  root: string,
  opts: {
    readonly previousTag: string;
    readonly tag: string;
    readonly to?: string;
    readonly repo?: string;
  },
) {
  const to = opts.to ?? 'HEAD';
  const repo =
    opts.repo ??
    (yield* output(root, 'gh', [
      'repo',
      'view',
      '--json',
      'nameWithOwner',
      '--jq',
      '.nameWithOwner',
    ]));
  const packages = yield* notesPackages(root, to);
  const changes = (yield* changesBetween(root, opts.previousTag, to)).filter(
    ({ subject, files }) =>
      !isReleaseCommit(subject) && changedPackages(files, packages).length > 0,
  );
  const github = yield* gitHubInfo(root, repo, changes);
  return renderNotes({
    entries: notesEntries({ changes, packages, github, repo }),
    packages,
    newContributors: yield* newContributors(root, { ...opts, repo, to }),
    repo,
    previousTag: opts.previousTag,
    tag: opts.tag,
  });
});
