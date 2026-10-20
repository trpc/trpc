import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  TwoslashShikiFunction,
  TwoslashShikiReturn,
} from '@shikijs/twoslash/core';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import ts from 'typescript6';

import {
  type Closure,
  installedPackageOf,
  type Lockfile,
  readLockfile,
} from './lockfile.ts';

/** Bump when an entry's shape or what goes into a key changes. */
const version = 2;

/** Entries no build has read for this long are deleted. */
const maxAgeMs = 14 * 24 * 60 * 60 * 1000;

/**
 * Packages pnpm installs from the registry. Their files only change with
 * the lockfile, whose part the block's app installs from is in the key, so
 * they aren't hashed.
 */
const installed = /[/\\]node_modules[/\\]\.pnpm[/\\]/;

/** pnpm's store, the `node_modules/.pnpm` dir an installed file is in. */
const storeDir = /^(.*[/\\]node_modules[/\\]\.pnpm)[/\\]/;

/**
 * Errors whose block could compile differently after any install: an import
 * or types that didn't resolve might resolve from another package's
 * dependencies, outside the app's part of the lockfile.
 */
const unresolvedCodes = new Set([2307, 2688, 2792, 7016]);

const sourceFile = /\.[cm]?tsx?$/;
const declarationFile = /\.d\.[cm]?ts$/;

export interface TwoslashCacheOptions {
  /** Where entries live, one JSON file per block. */
  readonly dir: string;
  /** `pnpm-lock.yaml`. A block's key has the part its app installs from. */
  readonly lockfile: string;
  /** The packages that compile blocks, as dependencies of the workspace package at `dir`; they're in every key. */
  readonly tools: {
    readonly dir: string;
    readonly packages: ReadonlyArray<string>;
  };
}

const Entry = Schema.Struct({
  /** Each file the block's program read, outside `installed`, and its {@link fingerprint}. */
  deps: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
  /** The links by name that installed packages outside the block's closure were found through, and the dir each pointed at. */
  links: Schema.optional(
    Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
  ),
  result: Schema.Struct({
    code: Schema.String,
    meta: Schema.optional(
      Schema.Struct({ extension: Schema.optional(Schema.String) }),
    ),
    nodes: Schema.Array(Schema.Unknown),
  }),
});

type Entry = typeof Entry.Type;

const EntryJson = Schema.fromJsonString(Entry);
const decodeEntry = Schema.decodeUnknownEffect(EntryJson);
const encodeEntry = Schema.encodeEffect(EntryJson);

function hash(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * What a block can see of a file it read. For a TypeScript source that
 * declares its exports' types (`isolatedDeclarations`, as the workspace
 * packages do), that's its declarations and what it imports, so an edit
 * inside a function body keeps the blocks that import it. Anything else is
 * its text.
 */
export function fingerprint(fileName: string, text: string) {
  const known = fingerprints.get(fileName);
  if (known?.text === text) {
    return known.hash;
  }
  const fileHash = computeFingerprint(fileName, text);
  fingerprints.set(fileName, { hash: fileHash, text });
  return fileHash;
}

/** The last {@link fingerprint} of each file: most blocks read the same package files. */
const fingerprints = new Map<
  string,
  { readonly hash: string; readonly text: string }
>();

function computeFingerprint(fileName: string, text: string) {
  if (sourceFile.test(fileName) && !declarationFile.test(fileName)) {
    const declarations = ts.transpileDeclaration(text, {
      compilerOptions: {},
      fileName,
      reportDiagnostics: true,
    });
    if (!declarations.diagnostics?.length) {
      const imports = ts.preProcessFile(text, true, true);
      return hash(
        JSON.stringify([
          declarations.outputText,
          ...[
            imports.importedFiles,
            imports.referencedFiles,
            imports.typeReferenceDirectives,
            imports.libReferenceDirectives,
          ].map((references) =>
            references.map((reference) => reference.fileName).toSorted(),
          ),
        ]),
      );
    }
  }
  return hash(text);
}

function revive(entry: Entry): TwoslashShikiReturn {
  // SAFETY: written by `set` from a twoslash result's nodes, which are plain JSON.
  const nodes = entry.result.nodes as TwoslashShikiReturn['nodes'];
  const extension = entry.result.meta?.extension;
  return {
    code: entry.result.code,
    ...(entry.result.meta && {
      meta: extension === undefined ? {} : { extension },
    }),
    nodes,
  };
}

/** What twoslash compiles a block from. */
export interface TwoslashBlock {
  readonly code: string;
  readonly lang: string | undefined;
  /** With the compiler options and, for a sample, every file of its app. */
  readonly options: Parameters<TwoslashShikiFunction>[2];
  /** The project root twoslash compiles in. */
  readonly root: string;
}

/** A source file of a block's program: its path and the text TypeScript read. */
interface ProgramFile {
  readonly fileName: string;
  readonly text: string;
}

/** The cache as one render reads and writes it. Lookups are synchronous, as Shiki calls twoslash. */
interface TwoslashCacheSession {
  /** Writes new entries and marks the ones read as used. Never fails: a cache that can't be written only costs time. */
  readonly flush: Effect.Effect<void, never, FileSystem.FileSystem | Path.Path>;
  /** The cached result, if every file it read is unchanged. */
  readonly get: (key: string) => TwoslashShikiReturn | undefined;
  readonly key: (block: TwoslashBlock) => string;
  readonly set: (
    key: string,
    result: TwoslashShikiReturn,
    files: Iterable<ProgramFile>,
  ) => void;
}

export interface TwoslashCache {
  readonly open: Effect.Effect<
    TwoslashCacheSession,
    never,
    FileSystem.FileSystem | Path.Path
  >;
  /** Blocks read from the cache and blocks compiled, since the process started. */
  readonly stats: { hits: number; misses: number };
}

function realpathOrEmpty(file: string) {
  try {
    return realpathSync(file);
  } catch {
    return '';
  }
}

/**
 * Where TypeScript finds an installed package by name when the package
 * importing it doesn't depend on it (`happy-dom`'s `import 'buffer'`):
 * pnpm's hoisted links, beside the store and at the workspace root, which
 * point at whichever version the workspace installs.
 */
function linksTo(store: string, workspace: string, installedPackage: string) {
  const name = installedPackage.slice(0, installedPackage.lastIndexOf('@'));
  return [
    join(store, 'node_modules', name),
    join(workspace, 'node_modules', name),
  ];
}

/**
 * The {@link linksTo} that `outside`'s installed packages (by the store
 * each is in) could have been found through, with where each points, if
 * every package is one a link points at or one those reach. `undefined`
 * if one was found some other way.
 */
function hoistedLinks(
  lockfile: Lockfile,
  closure: Closure,
  outside: ReadonlyMap<string, string>,
  workspace: string,
) {
  const links = new Map<string, string>();
  const reached = new Set(closure.packages);
  for (const [installedPackage, store] of outside) {
    for (const link of linksTo(store, workspace, installedPackage)) {
      const dir = realpathOrEmpty(link);
      if (installedPackageOf(join(dir, 'package.json')) === installedPackage) {
        links.set(link, dir);
        for (const reachedPackage of lockfile.packagesFrom(installedPackage)) {
          reached.add(reachedPackage);
        }
      }
    }
  }
  return [...outside.keys()].every((installedPackage) =>
    reached.has(installedPackage),
  )
    ? [...links]
    : undefined;
}

/** A file's size and mtime, which say when to read it again. */
const stampOf = Effect.fn('stampOf')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs.stat(file);
  return `${info.size}:${Option.match(info.mtime, {
    onNone: () => '',
    onSome: (mtime) => mtime.getTime(),
  })}`;
});

/** A lockfile that couldn't be read: every key misses until it can be. */
const unreadLockfile: Lockfile = {
  closure: () => undefined,
  hash: '',
  packagesFrom: () => new Set(),
};

/**
 * Twoslash results on disk, so a build, CI run, deploy or dev server start
 * compiles only the blocks whose inputs changed.
 *
 * A key covers the block, its compiler options and app files, the `tools`,
 * and the part of the lockfile the block's app installs from (its closure),
 * or the whole lockfile when the app isn't a workspace package. An entry
 * also lists every other file its program read (the workspace packages a
 * sample imports, say) with its {@link fingerprint}, and is a miss when one
 * changed. A block that read an installed package outside its closure
 * through a hoisted link ({@link linksTo}) lists where the link pointed,
 * and is a miss when it points elsewhere; the packages that package reaches
 * come with it. A block that read one some other way, or whose import
 * didn't resolve, lists the lockfile too.
 */
export function makeTwoslashCache(
  options: TwoslashCacheOptions,
): TwoslashCache {
  const stats = { hits: 0, misses: 0 };

  /** {@link fingerprint}s of files on disk, recomputed when a file's stamp changes. */
  const fileHashes = new Map<
    string,
    { readonly hash: string; readonly stamp: string }
  >();

  const hashFile = Effect.fn('hashFile')(
    function* (file: string) {
      const fs = yield* FileSystem.FileSystem;
      const stamp = yield* stampOf(file);
      const known = fileHashes.get(file);
      if (known?.stamp === stamp) {
        return known.hash;
      }
      const fileHash = fingerprint(file, yield* fs.readFileString(file));
      fileHashes.set(file, { hash: fileHash, stamp });
      return fileHash;
    },
    Effect.orElseSucceed(() => ''),
  );

  /** The lockfile as last read, read again when its stamp changes. */
  let lockfileRead:
    | { readonly lockfile: Lockfile; readonly stamp: string }
    | undefined;

  const readLockfileOnce = Effect.gen(function* () {
    const stamp = yield* stampOf(options.lockfile);
    if (lockfileRead?.stamp !== stamp) {
      lockfileRead = {
        lockfile: yield* Effect.try(() => readLockfile(options.lockfile)),
        stamp,
      };
    }
    return lockfileRead.lockfile;
  }).pipe(Effect.orElseSucceed(() => unreadLockfile));

  const loadEntries = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = new Map<string, Entry>();
    const names = yield* fs
      .readDirectory(options.dir)
      .pipe(Effect.orElseSucceed((): Array<string> => []));
    yield* Effect.forEach(
      names.filter((name) => name.endsWith('.json')),
      (name) =>
        Effect.gen(function* () {
          const file = path.join(options.dir, name);
          const info = yield* fs.stat(file);
          const mtime = Option.getOrElse(info.mtime, () => new Date(0));
          if (Date.now() - mtime.getTime() > maxAgeMs) {
            return yield* fs.remove(file);
          }
          const entry = yield* decodeEntry(yield* fs.readFileString(file));
          entries.set(name.slice(0, -'.json'.length), entry);
        }).pipe(Effect.ignore),
      { concurrency: 64 },
    );
    return entries;
  });
  const entries = Effect.runSync(Effect.cached(loadEntries));

  const open = Effect.gen(function* () {
    const store = yield* entries;
    const lockfile = yield* readLockfileOnce;
    const tools =
      lockfile.closure(options.tools.dir, options.tools.packages)?.hash ??
      lockfile.hash;
    /** The closure each key was made with, for `set` to check the files against. */
    const closures = new Map<string, Closure | undefined>();
    const current = new Map(
      yield* Effect.forEach(
        new Set(
          [...store.values()].flatMap((entry) =>
            entry.deps.map(([file]) => file),
          ),
        ),
        (file) =>
          Effect.map(hashFile(file), (fileHash) => [file, fileHash] as const),
        { concurrency: 64 },
      ),
    );
    const fs = yield* FileSystem.FileSystem;
    const currentLinks = new Map(
      yield* Effect.forEach(
        new Set(
          [...store.values()].flatMap((entry) =>
            (entry.links ?? []).map(([link]) => link),
          ),
        ),
        (link) =>
          Effect.map(
            fs.realPath(link).pipe(Effect.orElseSucceed(() => '')),
            (dir) => [link, dir] as const,
          ),
        { concurrency: 64 },
      ),
    );
    const used = new Set<string>();
    const written = new Map<string, Entry>();

    const session: TwoslashCacheSession = {
      flush: Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const file = (key: string) => path.join(options.dir, `${key}.json`);
        if (written.size) {
          yield* fs.makeDirectory(options.dir, { recursive: true });
        }
        const now = new Date();
        yield* Effect.forEach(
          written,
          ([key, entry]) =>
            Effect.flatMap(encodeEntry(entry), (json) =>
              fs.writeFileString(file(key), json),
            ),
          { concurrency: 64 },
        );
        yield* Effect.forEach(used, (key) => fs.utimes(file(key), now, now), {
          concurrency: 64,
        });
        written.clear();
        used.clear();
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning(
            `Couldn't write the twoslash cache: ${error.message}`,
          ),
        ),
      ),
      get(key) {
        const entry = store.get(key);
        if (
          !entry ||
          entry.deps.some(
            ([file, fileHash]) => current.get(file) !== fileHash,
          ) ||
          entry.links?.some(([link, dir]) => currentLinks.get(link) !== dir)
        ) {
          return undefined;
        }
        stats.hits++;
        used.add(key);
        return revive(entry);
      },
      key(block) {
        const closure = lockfile.closure(block.root);
        const key = hash(
          JSON.stringify([
            version,
            tools,
            closure?.hash ?? lockfile.hash,
            block,
          ]),
        );
        closures.set(key, closure);
        return key;
      },
      set(key, result, files) {
        stats.misses++;
        const closure = closures.get(key);
        const deps: Array<readonly [string, string]> = [];
        let listsLockfile =
          closure !== undefined &&
          result.nodes.some(
            (node) =>
              node.type === 'error' &&
              typeof node.code === 'number' &&
              unresolvedCodes.has(node.code),
          );
        /** Installed packages read from outside the closure, and the store each is in. */
        const outside = new Map<string, string>();
        for (const file of files) {
          if (installed.test(file.fileName)) {
            const installedPackage = installedPackageOf(file.fileName);
            const store = storeDir.exec(file.fileName)?.[1];
            if (closure === undefined) {
              continue;
            }
            if (installedPackage === undefined || store === undefined) {
              listsLockfile = true;
            } else if (!closure.packages.has(installedPackage)) {
              outside.set(installedPackage, store);
            }
            continue;
          }
          const fileHash = fingerprint(file.fileName, file.text);
          deps.push([file.fileName, fileHash]);
          current.set(file.fileName, fileHash);
        }
        const links =
          closure && !listsLockfile
            ? hoistedLinks(
                lockfile,
                closure,
                outside,
                dirname(options.lockfile),
              )
            : undefined;
        if (closure && links === undefined) {
          listsLockfile = true;
        }
        if (listsLockfile) {
          deps.push([options.lockfile, lockfile.hash]);
          current.set(options.lockfile, lockfile.hash);
        }
        for (const [link, dir] of links ?? []) {
          currentLinks.set(link, dir);
        }
        const entry: Entry = {
          deps,
          ...(links?.length && { links }),
          result: {
            code: result.code,
            ...(result.meta && { meta: result.meta }),
            nodes: result.nodes,
          },
        };
        store.set(key, entry);
        written.set(key, entry);
      },
    };
    return session;
  });

  return { open, stats };
}
