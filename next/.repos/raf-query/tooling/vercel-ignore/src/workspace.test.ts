import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { workspace, writeTree } from "./testing.ts";
import { dependencyDirs, workspaceGlobs } from "./workspace.ts";

describe("workspaceGlobs", () => {
	it("reads the quoted and bare `packages` entries", () => {
		assert.deepStrictEqual(workspaceGlobs(workspace["pnpm-workspace.yaml"]), [
			"apps/*",
			"libs/*",
		]);
	});
});

describe("dependencyDirs", () => {
	it.effect("follows `workspace:` dependencies transitively", () =>
		Effect.gen(function* () {
			const root = yield* writeTree(workspace);
			const dirs = yield* dependencyDirs(root, "apps/web");
			assert.deepStrictEqual(dirs.toSorted(), ["apps/web", "libs/a", "libs/b"]);
		}).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
	);

	it.effect("fails on an unreadable manifest", () =>
		Effect.gen(function* () {
			const root = yield* writeTree({
				...workspace,
				"libs/a/package.json": "{",
			});
			const error = yield* Effect.flip(dependencyDirs(root, "apps/web"));
			assert.strictEqual(error._tag, "SchemaError");
		}).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
	);
});
