/**
 * The part of `pnpm-lock.yaml` a workspace package's installs come from, so a
 * cache keyed by it survives lockfile changes elsewhere in the workspace.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { parseAllDocuments } from 'yaml';

type Dependencies = Readonly<Record<string, string>>;

interface Importer {
  readonly dependencies?: Readonly<
    Record<string, { readonly version: string }>
  >;
  readonly devDependencies?: Readonly<
    Record<string, { readonly version: string }>
  >;
  readonly optionalDependencies?: Readonly<
    Record<string, { readonly version: string }>
  >;
}

interface Snapshot {
  readonly dependencies?: Dependencies;
  readonly optionalDependencies?: Dependencies;
}

interface LockfileDocument {
  readonly importers?: Readonly<Record<string, Importer>>;
  readonly lockfileVersion?: string;
  readonly packages?: Readonly<Record<string, unknown>>;
  readonly settings?: unknown;
  readonly snapshots?: Readonly<Record<string, Snapshot>>;
}

/** What a package's types resolve through, which the lockfile doesn't record. */
const resolutionFields = [
  'exports',
  'imports',
  'main',
  'module',
  'type',
  'types',
  'typesVersions',
] as const;

export interface Closure {
  /** A hash of every importer, snapshot and package the closure reaches. */
  readonly hash: string;
  /** The installed packages it reaches, as `name@version`. */
  readonly packages: ReadonlySet<string>;
}

export interface Lockfile {
  /** A hash of the whole file. */
  readonly hash: string;
  /**
   * The workspace package at `dir` (or only its `dependencies`, when named),
   * the workspace packages it links to, and every package installed for
   * them, transitively. `undefined` if `dir` isn't a workspace package.
   */
  readonly closure: (
    dir: string,
    dependencies?: ReadonlyArray<string>,
  ) => Closure | undefined;
  /**
   * The installed packages the package `id` (`name@version`) reaches, itself
   * included, as `name@version`, whichever peers it was installed with.
   * Empty when the lockfile doesn't install it.
   */
  readonly packagesFrom: (id: string) => ReadonlySet<string>;
}

function hash(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

/** `name@version` without the peers pnpm appends: `react-dom@19.3.0(react@19.3.0)` is `react-dom@19.3.0`. */
function withoutPeers(id: string) {
  const peers = id.indexOf('(');
  return peers === -1 ? id : id.slice(0, peers);
}

/** The snapshot of `name` at `version`, which names another package when it's an alias (`npm:typescript@6.0.3`). */
function snapshotId(name: string, version: string) {
  return withoutPeers(version).lastIndexOf('@') > 0
    ? version
    : `${name}@${version}`;
}

function packageJsonFields(dir: string) {
  try {
    const json: Record<string, unknown> = JSON.parse(
      readFileSync(join(dir, 'package.json'), 'utf8'),
    );
    return resolutionFields.map((field) => json[field] ?? null);
  } catch {
    return null;
  }
}

/** Reads `pnpm-lock.yaml` once; closures are computed when asked for, and kept. */
export function readLockfile(file: string): Lockfile {
  const text = readFileSync(file, 'utf8');
  const root = dirname(file);
  // pnpm writes its own install (`packageManagerDependencies`) as a first
  // document; the workspace's is the one with snapshots.
  const lockfile = (parseAllDocuments(text)
    .map((document) => document.toJS() as LockfileDocument | null)
    .findLast((document) => document?.snapshots !== undefined) ??
    {}) satisfies LockfileDocument;
  const closures = new Map<string, Closure | undefined>();

  const compute = (
    dir: string,
    only: ReadonlyArray<string> | undefined,
  ): Closure | undefined => {
    const start = relative(root, dir).split('\\').join('/') || '.';
    if (!lockfile.importers?.[start]) {
      return undefined;
    }
    const importers: Record<string, unknown> = {};
    const snapshots: Record<string, unknown> = {};
    const packages: Record<string, unknown> = {};
    const pendingImporters: Array<[string, ReadonlyArray<string> | undefined]> =
      [[start, only]];
    const pendingSnapshots: Array<string> = [];

    const reach = (fromImporter: string, name: string, version: string) => {
      if (version.startsWith('link:')) {
        const linked =
          relative(root, join(root, fromImporter, version.slice(5)))
            .split('\\')
            .join('/') || '.';
        pendingImporters.push([linked, undefined]);
        return;
      }
      pendingSnapshots.push(snapshotId(name, version));
    };

    for (
      let next = pendingImporters.pop();
      next;
      next = pendingImporters.pop()
    ) {
      const [path, names] = next;
      if (path in importers) {
        continue;
      }
      const importer = lockfile.importers[path];
      const entries = [
        importer?.dependencies,
        importer?.devDependencies,
        importer?.optionalDependencies,
      ].flatMap((group) =>
        Object.entries(group ?? {}).filter(
          ([name]) => names === undefined || names.includes(name),
        ),
      );
      importers[path] = {
        dependencies: entries.map(([name, entry]) => [name, entry.version]),
        package: packageJsonFields(join(root, path)),
      };
      for (const [name, entry] of entries) {
        reach(path, name, entry.version);
      }
    }

    for (let id = pendingSnapshots.pop(); id; id = pendingSnapshots.pop()) {
      if (id in snapshots) {
        continue;
      }
      const snapshot = lockfile.snapshots?.[id];
      snapshots[id] = snapshot ?? null;
      packages[withoutPeers(id)] =
        lockfile.packages?.[withoutPeers(id)] ?? null;
      for (const group of [
        snapshot?.dependencies,
        snapshot?.optionalDependencies,
      ]) {
        for (const [name, version] of Object.entries(group ?? {})) {
          pendingSnapshots.push(snapshotId(name, version));
        }
      }
    }

    const sorted = (record: Record<string, unknown>) =>
      Object.keys(record)
        .toSorted()
        .map((key) => [key, record[key]]);
    return {
      hash: hash(
        JSON.stringify([
          lockfile.lockfileVersion ?? null,
          lockfile.settings ?? null,
          sorted(importers),
          sorted(snapshots),
          sorted(packages),
        ]),
      ),
      packages: new Set(Object.keys(packages)),
    };
  };

  /** Each package's snapshots, one per set of peers. */
  let snapshotsOf: Map<string, Array<string>> | undefined;
  const reached = new Map<string, ReadonlySet<string>>();

  return {
    closure(dir, dependencies) {
      const id = JSON.stringify([dir, dependencies ?? null]);
      if (!closures.has(id)) {
        closures.set(id, compute(dir, dependencies));
      }
      return closures.get(id);
    },
    hash: hash(text),
    packagesFrom(id) {
      const known = reached.get(id);
      if (known) {
        return known;
      }
      if (!snapshotsOf) {
        snapshotsOf = new Map();
        for (const snapshot of Object.keys(lockfile.snapshots ?? {})) {
          const name = withoutPeers(snapshot);
          snapshotsOf.set(name, [...(snapshotsOf.get(name) ?? []), snapshot]);
        }
      }
      const seen = new Set<string>();
      const packages = new Set<string>();
      const pending = [...(snapshotsOf.get(id) ?? [])];
      for (let next = pending.pop(); next; next = pending.pop()) {
        if (seen.has(next)) {
          continue;
        }
        seen.add(next);
        packages.add(withoutPeers(next));
        const snapshot = lockfile.snapshots?.[next];
        for (const group of [
          snapshot?.dependencies,
          snapshot?.optionalDependencies,
        ]) {
          for (const [name, version] of Object.entries(group ?? {})) {
            pending.push(snapshotId(name, version));
          }
        }
      }
      reached.set(id, packages);
      return packages;
    },
  };
}

/**
 * The installed package a file is in, as `name@version`, from its path in
 * pnpm's store: `node_modules/.pnpm/@types+react@19.3.0/node_modules/@types/react/index.d.ts`
 * is `@types/react@19.3.0`.
 */
export function installedPackageOf(fileName: string): string | undefined {
  const match =
    /[/\\]node_modules[/\\]\.pnpm[/\\][^/\\]+[/\\]node_modules[/\\]((?:@[^/\\]+[/\\])?[^/\\]+)[/\\]/.exec(
      fileName,
    );
  const store = /[/\\]node_modules[/\\]\.pnpm[/\\]([^/\\]+)[/\\]/.exec(
    fileName,
  )?.[1];
  if (!match?.[1] || store === undefined) {
    return undefined;
  }
  const name = match[1].replaceAll('\\', '/');
  const prefix = `${name.replace('/', '+')}@`;
  if (!store.startsWith(prefix)) {
    return undefined;
  }
  // The store dir is `<name>@<version>`, then `_<peers>` when it has any.
  const version = store.slice(prefix.length).split('_')[0];
  return version ? `${name}@${version}` : undefined;
}
