import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, FileSystem, Layer, Path } from "effect";

import { decide, git } from "./decide.ts";
import { workspace, writeTree } from "./testing.ts";

const commit = Effect.fn("commit")(function* (root: string, message: string) {
	yield* git(root, "add", "--all");
	yield* git(
		root,
		"-c",
		"user.name=Test",
		"-c",
		"user.email=test@example.com",
		"-c",
		"commit.gpgsign=false",
		"commit",
		"--quiet",
		"--message",
		message,
	);
	return yield* git(root, "rev-parse", "HEAD");
});

/** A repo whose `main` has {@link workspace}, checked out on `feature`. */
const setup = Effect.gen(function* () {
	const root = yield* writeTree(workspace);
	yield* git(root, "init", "--quiet", "--initial-branch", "main");
	const main = yield* commit(root, "main");
	yield* git(root, "checkout", "--quiet", "-b", "feature");
	return { main, root };
});

const touch = Effect.fn("touch")(function* (root: string, file: string) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	yield* fs.writeFileString(path.join(root, file), "# changed\n", {
		flag: "a",
	});
	return yield* commit(root, `touch ${file}`);
});

const run = (env: Record<string, string>) =>
	Effect.provide(
		Layer.merge(
			NodeServices.layer,
			ConfigProvider.layer(ConfigProvider.fromUnknown(env)),
		),
	);

const decideFor = Effect.fn("decideFor")(function* (
	root: string,
	project: string,
) {
	const path = yield* Path.Path;
	return yield* decide(path.join(root, project), `file://${root}`);
});

describe("decide", () => {
	it.effect("skips when nothing the project uses changed", () =>
		Effect.gen(function* () {
			const root = (yield* setup).root;
			const previous = yield* touch(root, "apps/web/a.ts");
			yield* touch(root, "libs/c/a.ts");
			yield* touch(root, "apps/other/a.ts");
			const decision = yield* decideFor(root, "apps/web").pipe(
				run({
					VERCEL_GIT_COMMIT_REF: "feature",
					VERCEL_GIT_PREVIOUS_SHA: previous,
				}),
			);
			assert.isFalse(decision.build);
		}).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
	);

	for (const file of ["libs/b/a.ts", "pnpm-workspace.yaml", "pnpm-lock.yaml"]) {
		it.effect(`builds when ${file} changed`, () =>
			Effect.gen(function* () {
				const repo = yield* setup;
				yield* touch(repo.root, file);
				const decision = yield* decideFor(repo.root, "apps/web").pipe(
					run({
						VERCEL_GIT_COMMIT_REF: "feature",
						VERCEL_GIT_PREVIOUS_SHA: repo.main,
					}),
				);
				assert.isTrue(decision.build);
				assert.include(decision.reason, file);
			}).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
		);
	}

	it.effect("compares a branch's first deployment with main", () =>
		Effect.gen(function* () {
			const root = (yield* setup).root;
			yield* touch(root, "libs/b/a.ts");
			const env = { VERCEL_GIT_COMMIT_REF: "feature" };
			assert.isTrue((yield* decideFor(root, "apps/web").pipe(run(env))).build);
			assert.isFalse(
				(yield* decideFor(root, "apps/other").pipe(run(env))).build,
			);
		}).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
	);

	it.effect("builds main's first deployment", () =>
		Effect.gen(function* () {
			const root = (yield* setup).root;
			const decision = yield* decideFor(root, "apps/web").pipe(
				run({ VERCEL_GIT_COMMIT_REF: "main" }),
			);
			assert.isTrue(decision.build);
		}).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
	);

	it.effect("fails when the last deployment's commit is gone", () =>
		Effect.gen(function* () {
			const root = (yield* setup).root;
			const error = yield* Effect.flip(
				decideFor(root, "apps/web").pipe(
					run({ VERCEL_GIT_PREVIOUS_SHA: "0".repeat(40) }),
				),
			);
			assert.strictEqual(error._tag, "GitError");
		}).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
	);
});
