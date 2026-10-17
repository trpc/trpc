import { createHash } from "node:crypto";

import type {
	TwoslashShikiFunction,
	TwoslashShikiReturn,
} from "@shikijs/twoslash/core";
import { Effect, FileSystem, Option, Path, Schema } from "effect";

/** Bump when an entry's shape or what goes into a key changes. */
const version = 1;

/** Entries no build has read for this long are deleted. */
const maxAgeMs = 14 * 24 * 60 * 60 * 1000;

/**
 * Packages pnpm installs from the registry. Their files only change with
 * the lockfile, which is one of the cache's `inputs`, so they aren't hashed.
 */
const installed = /[/\\]node_modules[/\\]\.pnpm[/\\]/;

export interface TwoslashCacheOptions {
	/** Where entries live, one JSON file per block. */
	readonly dir: string;
	/** Files whose contents go into every key, like the lockfile. */
	readonly inputs: ReadonlyArray<string>;
}

const Entry = Schema.Struct({
	/** Each file the block's program read, outside `installed`, and its hash. */
	deps: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
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
	return createHash("sha256").update(text).digest("hex");
}

function revive(entry: Entry): TwoslashShikiReturn {
	// SAFETY: written by `set` from a twoslash result's nodes, which are plain JSON.
	const nodes = entry.result.nodes as TwoslashShikiReturn["nodes"];
	return {
		code: entry.result.code,
		...(entry.result.meta && { meta: entry.result.meta }),
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

/**
 * Twoslash results on disk, so a build, CI run, deploy or dev server start
 * compiles only the blocks whose inputs changed.
 *
 * A key covers the block, its compiler options and app files, and `inputs`.
 * An entry also lists every other file its program read (the workspace
 * packages a sample imports, say) with a hash, and is a miss when one
 * changed.
 */
export function makeTwoslashCache(
	options: TwoslashCacheOptions,
): TwoslashCache {
	const stats = { hits: 0, misses: 0 };

	const loadEntries = Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const entries = new Map<string, Entry>();
		const names = yield* fs
			.readDirectory(options.dir)
			.pipe(Effect.orElseSucceed((): Array<string> => []));
		yield* Effect.forEach(
			names.filter((name) => name.endsWith(".json")),
			(name) =>
				Effect.gen(function* () {
					const file = path.join(options.dir, name);
					const info = yield* fs.stat(file);
					const mtime = Option.getOrElse(info.mtime, () => new Date(0));
					if (Date.now() - mtime.getTime() > maxAgeMs) {
						return yield* fs.remove(file);
					}
					const entry = yield* decodeEntry(yield* fs.readFileString(file));
					entries.set(name.slice(0, -".json".length), entry);
				}).pipe(Effect.ignore),
			{ concurrency: 64 },
		);
		return entries;
	});
	const entries = Effect.runSync(Effect.cached(loadEntries));

	/** Hashes of files on disk, recomputed when a file's size or mtime changes. */
	const fileHashes = new Map<
		string,
		{ readonly hash: string; readonly stamp: string }
	>();

	const hashFile = Effect.fn("hashFile")(
		function* (file: string) {
			const fs = yield* FileSystem.FileSystem;
			const info = yield* fs.stat(file);
			const stamp = `${info.size}:${Option.match(info.mtime, {
				onNone: () => "",
				onSome: (mtime) => mtime.getTime(),
			})}`;
			const known = fileHashes.get(file);
			if (known?.stamp === stamp) {
				return known.hash;
			}
			const fileHash = hash(yield* fs.readFileString(file));
			fileHashes.set(file, { hash: fileHash, stamp });
			return fileHash;
		},
		Effect.orElseSucceed(() => ""),
	);

	const open = Effect.gen(function* () {
		const store = yield* entries;
		const inputs = yield* Effect.forEach(options.inputs, hashFile, {
			concurrency: "unbounded",
		});
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
					entry.deps.some(([file, fileHash]) => current.get(file) !== fileHash)
				) {
					return undefined;
				}
				stats.hits++;
				used.add(key);
				return revive(entry);
			},
			key: (block) => hash(JSON.stringify([version, inputs, block])),
			set(key, result, files) {
				stats.misses++;
				const deps: Array<readonly [string, string]> = [];
				for (const file of files) {
					if (!installed.test(file.fileName)) {
						const fileHash = hash(file.text);
						deps.push([file.fileName, fileHash]);
						current.set(file.fileName, fileHash);
					}
				}
				const entry: Entry = {
					deps,
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
