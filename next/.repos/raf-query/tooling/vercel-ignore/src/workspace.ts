import { Data, Effect, FileSystem, Path, Schema } from "effect";

const Dependencies = Schema.optionalKey(
	Schema.Record(Schema.String, Schema.String),
);

const Manifest = Schema.fromJsonString(
	Schema.Struct({
		dependencies: Dependencies,
		devDependencies: Dependencies,
		name: Schema.optionalKey(Schema.String),
		optionalDependencies: Dependencies,
		peerDependencies: Dependencies,
	}),
);

class WorkspaceError extends Data.TaggedError("WorkspaceError")<{
	readonly message: string;
}> {}

const readManifest = Effect.fn("readManifest")(function* (dir: string) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	return yield* Schema.decodeEffect(Manifest)(
		yield* fs.readFileString(path.join(dir, "package.json")),
	);
});

/** The `packages` globs of `pnpm-workspace.yaml`. */
export const workspaceGlobs = (yaml: string): ReadonlyArray<string> => {
	const block = /^packages:\n((?:[ \t]+-.*\n?)+)/m.exec(yaml)?.[1] ?? "";
	return [...block.matchAll(/-\s*["']?([^"'\n]+?)["']?\s*$/gm)].map(
		(match) => match[1],
	);
};

/**
 * The workspace packages' directories, relative to `root`. Globs only use `*`
 * segments, which, as in pnpm, don't match dot directories.
 */
const workspaceDirs = Effect.fn("workspaceDirs")(function* (root: string) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const globs = workspaceGlobs(
		yield* fs.readFileString(path.join(root, "pnpm-workspace.yaml")),
	);
	if (globs.length === 0) {
		return yield* new WorkspaceError({
			message: "pnpm-workspace.yaml has no `packages:` list",
		});
	}

	const dirs: Array<string> = [];
	for (const glob of globs) {
		let matches = [""];
		for (const segment of glob.split("/")) {
			const next: Array<string> = [];
			for (const dir of matches) {
				if (segment !== "*") {
					next.push(path.join(dir, segment));
					continue;
				}
				const parent = path.join(root, dir);
				if (!(yield* fs.exists(parent))) {
					continue;
				}
				for (const entry of yield* fs.readDirectory(parent)) {
					const info = yield* fs.stat(path.join(parent, entry));
					if (!entry.startsWith(".") && info.type === "Directory") {
						next.push(path.join(dir, entry));
					}
				}
			}
			matches = next;
		}
		for (const dir of matches) {
			if (yield* fs.exists(path.join(root, dir, "package.json"))) {
				dirs.push(dir);
			}
		}
	}
	return dirs;
});

/**
 * `project` and every workspace package it depends on through `workspace:`,
 * in any dependency field and transitively. Paths are relative to `root`.
 */
export const dependencyDirs = Effect.fn("dependencyDirs")(function* (
	root: string,
	project: string,
) {
	const path = yield* Path.Path;
	const byName = new Map<string, string>();
	for (const dir of yield* workspaceDirs(root)) {
		const manifest = yield* readManifest(path.join(root, dir));
		if (manifest.name !== undefined) {
			byName.set(manifest.name, dir);
		}
	}

	const seen = new Set<string>();
	const queue = [project];
	for (let dir = queue.pop(); dir !== undefined; dir = queue.pop()) {
		if (seen.has(dir)) {
			continue;
		}
		seen.add(dir);
		const manifest = yield* readManifest(path.join(root, dir));
		for (const field of [
			manifest.dependencies,
			manifest.devDependencies,
			manifest.optionalDependencies,
			manifest.peerDependencies,
		]) {
			for (const [name, version] of Object.entries(field ?? {})) {
				const dep = byName.get(name);
				if (dep !== undefined && version.startsWith("workspace:")) {
					queue.push(dep);
				}
			}
		}
	}
	return [...seen];
});
