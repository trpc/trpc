#!/usr/bin/env node
/**
 * Copy the repo-root LICENSE.md / CHANGELOG.md into the package being packed,
 * so `pnpm pack` / `npm publish` include them. Each package keeps its own
 * README.md. Runs from a package's `prepack`, so cwd is that package.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path } from "effect";

Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "..");
	const pkg = process.cwd();

	for (const name of ["LICENSE.md", "CHANGELOG.md"]) {
		yield* fs.copyFile(path.join(root, name), path.join(pkg, name));
		yield* Console.log(`synced ${name} → ${path.relative(root, pkg)}/${name}`);
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
