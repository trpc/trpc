import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";

import {
	Builder,
	CommandError,
	committer,
	read,
	restoreBuildCaches,
	saveBuildCaches,
	syncBranch,
} from "./sync.ts";

/** A source repo with one commit and an empty bare remote. */
const setup = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const tmp = yield* fs.makeTempDirectoryScoped();
	const root = path.join(tmp, "root");
	const remote = path.join(tmp, "remote.git");
	yield* read(tmp, "git", ["init", "--quiet", "--bare", remote]);
	yield* read(tmp, "git", [
		"init",
		"--quiet",
		"--initial-branch",
		"main",
		root,
	]);
	yield* fs.writeFileString(path.join(root, "README.md"), "source\n");
	yield* read(root, "git", ["add", "--all"]);
	yield* read(root, "git", [
		"-c",
		"user.name=Test",
		"-c",
		"user.email=test@example.com",
		"-c",
		"commit.gpgsign=false",
		"commit",
		"--quiet",
		"--message",
		"source",
	]);
	const source = (yield* read(root, "git", [
		"rev-parse",
		"--short",
		"HEAD",
	])).trim();
	const branchLog = (format: string) =>
		read(remote, "git", ["log", `--format=${format}`, "codesandbox"]).pipe(
			Effect.map((log) => log.trim().split("\n")),
		);
	const show = (file: string) =>
		read(remote, "git", ["show", `codesandbox:${file}`]);
	return { branchLog, remote, root, show, source };
});

/** Writes `files` into the worktree, and returns the one app directory to build. */
const generate = (files: Record<string, string>) => (dir: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		for (const entry of yield* fs.readDirectory(dir)) {
			if (entry !== ".git") {
				yield* fs.remove(path.join(dir, entry), { recursive: true });
			}
		}
		for (const [file, contents] of Object.entries(files)) {
			yield* fs.makeDirectory(path.dirname(path.join(dir, file)), {
				recursive: true,
			});
			yield* fs.writeFileString(path.join(dir, file), contents);
		}
		return [path.join(dir, "examples", "app")];
	});

const built: Array<string> = [];

/** Writes a lockfile, as installing does. */
const writesLockfile = Layer.effect(
	Builder,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		return Builder.of({
			build: (dir) =>
				Effect.sync(() => built.push(path.basename(dir))).pipe(
					Effect.andThen(
						fs.writeFileString(path.join(dir, "pnpm-lock.yaml"), "lockfile\n"),
					),
					Effect.orDie,
				),
		});
	}),
);

const failsToBuild = Layer.succeed(
	Builder,
	Builder.of({
		build: (dir) =>
			Effect.fail(
				new CommandError({
					args: ["build"],
					command: "pnpm",
					cwd: dir,
					exitCode: 1,
				}),
			),
	}),
);

const app = { "examples/app/package.json": "{}\n", "README.md": "branch\n" };

describe("syncBranch", () => {
	it.effect("creates the branch, then commits only what changed", () =>
		Effect.gen(function* () {
			const repo = yield* setup;
			built.length = 0;

			const first = yield* syncBranch(
				repo.root,
				repo.remote,
				"codesandbox",
				generate(app),
			);
			assert.deepStrictEqual(built, ["app"]);
			assert.deepStrictEqual(yield* repo.branchLog("%H %P %s"), [
				`${first}  chore: sync examples from main (${repo.source})`,
			]);
			assert.deepStrictEqual(yield* repo.branchLog("%an <%ae>"), [
				`${committer.name} <${committer.email}>`,
			]);
			assert.strictEqual(
				yield* repo.show("examples/app/pnpm-lock.yaml"),
				"lockfile\n",
			);
			assert.strictEqual(yield* repo.show("README.md"), "branch\n");

			assert.isUndefined(
				yield* syncBranch(repo.root, repo.remote, "codesandbox", generate(app)),
			);
			assert.strictEqual((yield* repo.branchLog("%H")).length, 1);

			const third = yield* syncBranch(
				repo.root,
				repo.remote,
				"codesandbox",
				generate({ "examples/app/package.json": '{ "changed": true }\n' }),
			);
			assert.deepStrictEqual(yield* repo.branchLog("%H %P"), [
				`${third} ${first}`,
				first,
			]);
			const files = yield* read(repo.remote, "git", [
				"ls-tree",
				"-r",
				"--name-only",
				"codesandbox",
			]);
			assert.deepStrictEqual(files.trim().split("\n"), [
				"examples/app/package.json",
				"examples/app/pnpm-lock.yaml",
			]);
		}).pipe(
			Effect.provide(Layer.provideMerge(writesLockfile, NodeServices.layer)),
		),
	);

	it.effect("cleans up its worktree", () =>
		Effect.gen(function* () {
			const repo = yield* setup;
			yield* syncBranch(repo.root, repo.remote, "codesandbox", generate(app));
			yield* syncBranch(repo.root, repo.remote, "codesandbox", generate(app));
			const worktrees = yield* read(repo.root, "git", [
				"worktree",
				"list",
				"--porcelain",
			]);
			assert.strictEqual(worktrees.match(/^worktree /gm)?.length, 1);
			assert.strictEqual(
				yield* read(repo.root, "git", ["branch", "--list"]),
				"* main\n",
			);
		}).pipe(
			Effect.provide(Layer.provideMerge(writesLockfile, NodeServices.layer)),
		),
	);

	it.effect("pushes nothing if a build fails", () =>
		Effect.gen(function* () {
			const repo = yield* setup;
			const error = yield* syncBranch(
				repo.root,
				repo.remote,
				"codesandbox",
				generate(app),
			).pipe(Effect.flip);
			assert.instanceOf(error, CommandError);
			assert.strictEqual(
				yield* read(repo.remote, "git", ["branch", "--list"]),
				"",
				"the remote has no branches",
			);
		}).pipe(
			Effect.provide(Layer.provideMerge(failsToBuild, NodeServices.layer)),
		),
	);
});

describe("build caches", () => {
	/** Writes `files` under a new temp directory, and returns it. */
	const tree = (files: Record<string, string>) =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const dir = yield* fs.makeTempDirectoryScoped();
			for (const [file, contents] of Object.entries(files)) {
				yield* fs.makeDirectory(path.dirname(path.join(dir, file)), {
					recursive: true,
				});
				yield* fs.writeFileString(path.join(dir, file), contents);
			}
			return dir;
		});

	it.effect(
		"keeps each app's Next.js cache, and restores it into a new copy",
		() =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const path = yield* Path.Path;
				const cache = yield* tree({ "nextjs/stale": "old\n" });
				const copy = yield* tree({
					"apps/nextjs/.next/cache/turbopack/db": "compiled\n",
					"apps/nextjs/.next/server/page.js": "output\n",
					"apps/tanstack-start/package.json": "{}\n",
				});
				yield* saveBuildCaches(cache, copy);
				assert.deepStrictEqual(
					(yield* fs.readDirectory(cache, { recursive: true })).toSorted(),
					["nextjs", "nextjs/turbopack", "nextjs/turbopack/db"],
				);

				const fresh = yield* tree({
					"apps/nextjs/package.json": "{}\n",
					"apps/tanstack-start/package.json": "{}\n",
				});
				yield* restoreBuildCaches(cache, fresh);
				assert.strictEqual(
					yield* fs.readFileString(
						path.join(fresh, "apps/nextjs/.next/cache/turbopack/db"),
					),
					"compiled\n",
				);
				assert.isFalse(
					yield* fs.exists(path.join(fresh, "apps/tanstack-start/.next")),
				);
			}).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
	);

	it.effect("restores nothing from an empty cache", () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const cache = path.join(yield* tree({}), "missing");
			const copy = yield* tree({ "apps/nextjs/package.json": "{}\n" });
			yield* restoreBuildCaches(cache, copy);
			assert.isFalse(yield* fs.exists(path.join(copy, "apps/nextjs/.next")));
		}).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
	);
});
