import { Effect, FileSystem, Path } from "effect";

interface Manifest {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly name: string;
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

const manifest = (value: Manifest) => JSON.stringify(value);

/** Writes `files` (path → contents) under a scoped temp directory. */
export const writeTree = Effect.fn("writeTree")(function* (
	files: Readonly<Record<string, string>>,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = yield* fs.makeTempDirectoryScoped();
	for (const [file, contents] of Object.entries(files)) {
		yield* fs.makeDirectory(path.join(root, path.dirname(file)), {
			recursive: true,
		});
		yield* fs.writeFileString(path.join(root, file), contents);
	}
	return root;
});

/** `apps/web` → `lib-a` → (dev) `lib-b`; `lib-c` only by version range. */
export const workspace = {
	"apps/.hidden/package.json": manifest({ name: "hidden" }),
	"apps/other/package.json": manifest({
		dependencies: { "lib-c": "workspace:*" },
		name: "other",
	}),
	"apps/web/package.json": manifest({
		dependencies: { "lib-a": "workspace:*", "lib-c": "^1.0.0", react: "19" },
		name: "web",
	}),
	"libs/a/package.json": manifest({
		devDependencies: { "lib-b": "workspace:^" },
		name: "lib-a",
	}),
	"libs/b/package.json": manifest({
		name: "lib-b",
		peerDependencies: { "lib-a": "workspace:*" },
	}),
	"libs/c/package.json": manifest({ name: "lib-c" }),
	"libs/not-a-package/README.md": "",
	"package.json": manifest({ name: "root" }),
	"pnpm-workspace.yaml":
		'packages:\n  - "apps/*"\n  - libs/*\n\ncatalog:\n  effect: ^4.0.1\n',
};
