import { NodeServices } from "@effect/platform-node";
import type { TwoslashShikiReturn } from "@shikijs/twoslash/core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import { renderMarkdown } from "./markdown.ts";
import { makeTwoslashCache, type TwoslashBlock } from "./twoslash-cache.ts";

const result: TwoslashShikiReturn = {
	code: "const a = 1;",
	meta: { extension: "ts" },
	nodes: [],
};

function block(code: string): TwoslashBlock {
	return { code, lang: "ts", options: {}, root: "/samples/app" };
}

/**
 * A temporary dir with a lockfile, a source file and a sample app that
 * compiles inline blocks, removed when the test ends.
 */
const setup = Effect.fn("setup")(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = yield* fs.makeTempDirectoryScoped({ prefix: "twoslash-cache-" });
	const lockfile = path.join(root, "pnpm-lock.yaml");
	const source = path.join(root, "packages/react/src/index.ts");
	const samplesDir = path.join(root, "samples");
	yield* fs.makeDirectory(path.dirname(source), { recursive: true });
	yield* fs.makeDirectory(path.join(samplesDir, "tanstack-start/src"), {
		recursive: true,
	});
	yield* fs.writeFileString(
		path.join(samplesDir, "tanstack-start/src/app.ts"),
		"export {};",
	);
	yield* fs.writeFileString(lockfile, "lockfileVersion: 9");
	yield* fs.writeFileString(source, "export const a = 1;");
	yield* fs.writeFileString(
		path.join(samplesDir, "tanstack-start/tsconfig.json"),
		JSON.stringify({
			compilerOptions: { lib: ["es5"], strict: true, types: [] },
			include: ["src"],
		}),
	);
	return {
		installed: path.join(root, "node_modules/.pnpm/a@1/index.d.ts"),
		lockfile,
		options: { dir: path.join(root, "cache"), inputs: [lockfile] },
		samplesDir,
		source,
	};
});

describe("makeTwoslashCache", () => {
	it.effect("reads a block written by an earlier build", () =>
		Effect.gen(function* () {
			const dirs = yield* setup();
			const first = yield* makeTwoslashCache(dirs.options).open;
			const key = first.key(block("const a = 1;"));
			expect(first.get(key)).toBeUndefined();
			first.set(key, result, [
				{ fileName: dirs.source, text: "export const a = 1;" },
			]);
			yield* first.flush;

			const next = makeTwoslashCache(dirs.options);
			const session = yield* next.open;
			expect(session.key(block("const a = 1;"))).toBe(key);
			expect(session.get(key)).toEqual(result);
			expect(session.get(session.key(block("const b = 1;")))).toBe(undefined);
			expect(next.stats).toEqual({ hits: 1, misses: 0 });
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("misses when a file the block read changed", () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const dirs = yield* setup();
			const first = yield* makeTwoslashCache(dirs.options).open;
			const key = first.key(block("const a = 1;"));
			first.set(key, result, [
				{ fileName: dirs.source, text: "export const a = 1;" },
			]);
			yield* first.flush;

			yield* fs.writeFileString(dirs.source, "export const a = 2;");
			const session = yield* makeTwoslashCache(dirs.options).open;
			expect(session.get(key)).toBeUndefined();
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect(
		"keys installed packages by the lockfile instead of their files",
		() =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const dirs = yield* setup();
				const first = yield* makeTwoslashCache(dirs.options).open;
				const key = first.key(block("const a = 1;"));
				first.set(key, result, [
					{ fileName: dirs.installed, text: "export declare const a: 1;" },
				]);
				yield* first.flush;

				const unchanged = yield* makeTwoslashCache(dirs.options).open;
				expect(unchanged.get(key)).toEqual(result);

				yield* fs.writeFileString(dirs.lockfile, "lockfileVersion: 10");
				const upgraded = yield* makeTwoslashCache(dirs.options).open;
				expect(upgraded.key(block("const a = 1;"))).not.toBe(key);
			}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("deletes entries no build has read in two weeks", () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const dirs = yield* setup();
			const first = yield* makeTwoslashCache(dirs.options).open;
			const key = first.key(block("const a = 1;"));
			first.set(key, result, []);
			yield* first.flush;
			const file = path.join(dirs.options.dir, `${key}.json`);
			const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
			yield* fs.utimes(file, old, old);

			const session = yield* makeTwoslashCache(dirs.options).open;
			expect(session.get(key)).toBeUndefined();
			expect(yield* fs.exists(file)).toBe(false);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("renders a page from the cache the same as compiling it", () =>
		Effect.gen(function* () {
			const dirs = yield* setup();
			const markdown = [
				"```ts twoslash",
				'const keys = ["todos", 1] as const;',
				"//    ^?",
				"```",
			].join("\n");

			const compiled = makeTwoslashCache(dirs.options);
			const first = yield* renderMarkdown(markdown, {
				samplesDir: dirs.samplesDir,
				twoslashCache: compiled,
			});
			expect(compiled.stats).toEqual({ hits: 0, misses: 1 });
			expect(first.typeQueries).toEqual([
				['const keys: readonly ["todos", 1]'],
			]);

			const cached = makeTwoslashCache(dirs.options);
			const second = yield* renderMarkdown(markdown, {
				samplesDir: dirs.samplesDir,
				twoslashCache: cached,
			});
			expect(cached.stats).toEqual({ hits: 1, misses: 0 });
			expect(second).toEqual(first);
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});
