/**
 * Which commits change what `packages/*` publish. Stable releases and
 * canaries on push only go out for these, so a merge that touches only tests,
 * docs, examples or tooling releases nothing.
 *
 * A commit counts when it changes, in a public package:
 * - a file its tarball ships: its `files`, minus `!` patterns and Markdown
 *   (READMEs, and the agent skills, which are generated from the docs at
 *   pack time: a docs change ships with the next release instead of starting
 *   one);
 * - its build config, `tsdown.config.ts` or `tsconfig.build.json`, or the
 *   root `tsconfig.build.json` they extend;
 * - a field of its `package.json` other than `version`, `scripts` and
 *   `devDependencies`, with `catalog:` ranges read from `pnpm-workspace.yaml`.
 */
import { Effect } from 'effect';
import { parse as parseYaml } from 'yaml';
import { git } from './command.ts';
import type { Bump, PackageJson } from './version.ts';
import { readPackages, type WorkspacePackage } from './workspace.ts';

/** A `files` pattern, as npm matches it, as a glob from the package's root. */
function filesGlob(pattern: string) {
  const trimmed = pattern.replace(/^\.?\//, '').replace(/\/$/, '');
  return trimmed.includes('/') ? trimmed : `**/${trimmed}`;
}

/** Git pathspecs of the files `packages` publish or build them. */
export function publishedPathspecs(
  packages: ReadonlyArray<WorkspacePackage>,
): ReadonlyArray<string> {
  const include: Array<string> = [];
  const exclude: Array<string> = [];
  for (const { dir, pkg } of packages) {
    if (pkg.private === true) {
      continue;
    }
    for (const entry of pkg.files ?? []) {
      if (entry.startsWith('!')) {
        const glob = filesGlob(entry.slice(1));
        exclude.push(`${dir}/${glob}`, `${dir}/${glob}/**`);
      } else if (entry !== 'package.json') {
        const path = entry.replace(/^\.?\//, '').replace(/\/$/, '');
        include.push(`${dir}/${path}`, `${dir}/${path}/**`);
      }
    }
    include.push(`${dir}/tsdown.config.ts`, `${dir}/tsconfig.build.json`);
    exclude.push(`${dir}/**/*.md`);
  }
  // Every package's tsconfig.build.json extends it.
  include.push('tsconfig.build.json');
  return [
    ...include.map((path) => `:(glob)${path}`),
    ...exclude.map((path) => `:(glob,exclude)${path}`),
  ];
}

/** `pnpm-workspace.yaml`'s catalogs: `''` is the default `catalog:`. */
export type Catalogs = ReadonlyMap<string, Readonly<Record<string, string>>>;

export function parseCatalogs(workspaceYaml: string): Catalogs {
  const parsed = (parseYaml(workspaceYaml) ?? {}) as {
    catalog?: Record<string, string>;
    catalogs?: Record<string, Record<string, string>>;
  };
  return new Map([
    ['', parsed.catalog ?? {}],
    ...Object.entries(parsed.catalogs ?? {}),
  ]);
}

const publishedDependencyFields = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

/**
 * What of `pkg`'s `package.json` its users see, as a string to compare:
 * without the fields that don't reach them, and without the versions of the
 * packages released with it, which only release commits change.
 */
export function publishedManifest(
  pkg: PackageJson,
  opts: {
    readonly catalogs: Catalogs;
    readonly workspace: ReadonlySet<string>;
  },
) {
  const {
    version: _version,
    scripts: _scripts,
    devDependencies: _devDependencies,
    ...rest
  } = pkg;
  const result: Record<string, unknown> = { ...rest };
  for (const field of publishedDependencyFields) {
    const deps = pkg[field] as Record<string, string> | undefined;
    if (deps === undefined) {
      continue;
    }
    result[field] = Object.fromEntries(
      Object.entries(deps).map(([name, range]) => {
        if (opts.workspace.has(name)) {
          return [name, 'workspace'];
        }
        const catalog = /^catalog:(.*)$/.exec(range);
        return catalog === null
          ? [name, range]
          : [name, opts.catalogs.get(catalog[1] ?? '')?.[name] ?? range];
      }),
    );
  }
  return JSON.stringify(result);
}

const showOrUndefined = (root: string, rev: string, file: string) =>
  git(root, 'show', `${rev}:${file}`).pipe(
    Effect.orElseSucceed(() => undefined),
  );

/** The published manifests of `packages` at `rev`, by directory. */
const publishedManifestsAt = Effect.fn('publishedManifestsAt')(function* (
  root: string,
  rev: string,
  packages: ReadonlyArray<WorkspacePackage>,
) {
  const catalogs = parseCatalogs(
    (yield* showOrUndefined(root, rev, 'pnpm-workspace.yaml')) ?? '',
  );
  const workspace = new Set(packages.map(({ name }) => name));
  const manifests = new Map<string, string | undefined>();
  for (const { dir } of packages) {
    const raw = yield* showOrUndefined(root, rev, `${dir}/package.json`);
    const pkg =
      raw === undefined ? undefined : (JSON.parse(raw) as PackageJson);
    manifests.set(
      dir,
      pkg === undefined || pkg.private === true
        ? undefined
        : publishedManifest(pkg, { catalogs, workspace }),
    );
  }
  return manifests;
});

/** `git log --first-parent` over `range`, one line per commit. */
const firstParentLog = (
  root: string,
  range: string,
  opts: { readonly format: string; readonly paths: ReadonlyArray<string> },
) =>
  git(
    root,
    'log',
    '--first-parent',
    `--format=${opts.format}`,
    range,
    '--',
    ...opts.paths,
  ).pipe(Effect.map((out) => (out === '' ? [] : out.split('\n'))));

export interface ReleasableCommit {
  readonly sha: string;
  readonly subject: string;
}

/**
 * The commits on `to`'s first-parent history since `from` that change what
 * the public packages in `packages/*` publish, newest first.
 */
export const releasableCommits = Effect.fn('releasableCommits')(function* (
  root: string,
  from: string,
  to = 'HEAD',
) {
  const range = `${from}..${to}`;
  const packages = (yield* readPackages(root)).filter(
    ({ pkg }) => pkg.private !== true,
  );
  const releasable = new Set(
    yield* firstParentLog(root, range, {
      format: '%H',
      paths: publishedPathspecs(packages),
    }),
  );

  const manifestCommits = yield* firstParentLog(root, range, {
    format: '%H',
    paths: [':(glob)packages/*/package.json', 'pnpm-workspace.yaml'],
  });
  for (const sha of manifestCommits) {
    if (releasable.has(sha)) {
      continue;
    }
    const [before, after] = [
      yield* publishedManifestsAt(root, `${sha}^`, packages),
      yield* publishedManifestsAt(root, sha, packages),
    ];
    if ([...after].some(([dir, manifest]) => before.get(dir) !== manifest)) {
      releasable.add(sha);
    }
  }

  const commits: Array<ReleasableCommit> = [];
  for (const line of yield* firstParentLog(root, range, {
    format: '%H %s',
    paths: [],
  })) {
    const space = line.indexOf(' ');
    const sha = line.slice(0, space);
    if (releasable.has(sha)) {
      commits.push({ sha, subject: line.slice(space + 1) });
    }
  }
  return commits;
});

/**
 * Whether what the public packages publish differs between `from` and `to`,
 * whatever the commits between them: a change and its revert cancel out, and
 * `to` needn't descend from `from`.
 */
export const publishedChanged = Effect.fn('publishedChanged')(function* (
  root: string,
  from: string,
  to: string,
) {
  const packages = (yield* readPackages(root)).filter(
    ({ pkg }) => pkg.private !== true,
  );
  const files = yield* git(
    root,
    'diff',
    '--name-only',
    from,
    to,
    '--',
    ...publishedPathspecs(packages),
  );
  if (files !== '') {
    return true;
  }
  const [before, after] = [
    yield* publishedManifestsAt(root, from, packages),
    yield* publishedManifestsAt(root, to, packages),
  ];
  return [...after].some(([dir, manifest]) => before.get(dir) !== manifest);
});

/**
 * The bump a commit asks for, from its conventional-commit subject: `feat` is
 * a minor, `!` before the colon is a major, anything else a patch. Bodies are
 * pull request descriptions, which mention breaking changes of dependencies,
 * so they're not read.
 */
export function commitBump(subject: string): Bump {
  const match = /^(\w+)(?:\([^)]*\))?(!)?:/.exec(subject);
  if (match?.[2] === '!') {
    return 'major';
  }
  return match?.[1] === 'feat' ? 'minor' : 'patch';
}

/** The largest bump `commits` ask for. */
export function releaseBump(commits: ReadonlyArray<ReleasableCommit>): Bump {
  const asked = new Set(commits.map(({ subject }) => commitBump(subject)));
  return asked.has('major') ? 'major' : asked.has('minor') ? 'minor' : 'patch';
}
