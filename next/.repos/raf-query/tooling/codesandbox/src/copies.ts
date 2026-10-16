/**
 * Standalone copies of the example apps, for CodeSandbox to open one folder
 * at a time. Each copy is its own pnpm workspace: the app in `apps/<app>`, and
 * `examples/.shared/*` copied as-is into `packages/`, so `@examples/*` stay
 * `workspace:*`. Only `@raf-query/*` changes, to the published version.
 */
import { Effect, FileSystem, Path, type PlatformError } from "effect";

const repo = "KATT/raf-query";
export const branch = "codesandbox";
export const apps = [
	"nextjs",
	"react-router",
	"tanstack-start",
	"tanstack-start-effect",
] as const;
export type App = (typeof apps)[number];

/** The route each app's CodeSandbox link opens, relative to the app. */
const routes = {
	nextjs: "src/app/prefetch/issues/page.tsx",
	"react-router": "app/routes/prefetch/issues/route.tsx",
	"tanstack-start": "src/routes/prefetch/issues/index.tsx",
	"tanstack-start-effect": "src/routes/prefetch/issues/index.tsx",
} satisfies Record<App, string>;

const ignored = new Set([
	".DS_Store",
	".next",
	".output",
	".react-router",
	".tanstack",
	"build",
	"coverage",
	"dist",
	"next-env.d.ts",
	"node_modules",
	"vercel.json",
]);

export interface PackageJson {
	dependencies?: Record<string, string>;
	description?: string;
	devDependencies?: Record<string, string>;
	engines?: Record<string, string>;
	name: string;
	packageManager?: string;
	private?: boolean;
	scripts?: Record<string, string>;
	type?: string;
	version: string;
}

export function isIgnored(file: string, separator: string) {
	return file
		.split(separator)
		.some((part) => ignored.has(part) || part.endsWith(".tsbuildinfo"));
}

/** The link that opens `app`'s copy on CodeSandbox, at its issue list route. */
export function openUrl(app: App) {
	return `https://codesandbox.io/p/devbox/github/${repo}/tree/${branch}/examples/${app}?file=/apps/${app}/${routes[app]}`;
}

/**
 * The app's `package.json` outside the monorepo. `published` maps the
 * `@raf-query/*` packages to their npm version; other `workspace:`
 * dependencies must be in `packages/`.
 */
export function standalonePackageJson(
	pkg: PackageJson,
	published: ReadonlyMap<string, string>,
	workspace: ReadonlySet<string>,
): PackageJson {
	const replace = (deps: Record<string, string> | undefined) => {
		if (deps === undefined) {
			return undefined;
		}
		const entries = Object.entries(deps).map(([name, version]) => {
			if (!version.startsWith("workspace:") || workspace.has(name)) {
				return [name, version];
			}
			const replacement = published.get(name);
			if (replacement === undefined) {
				throw new Error(`no standalone version for ${name}@${version}`);
			}
			return [name, replacement];
		});
		return Object.fromEntries(entries);
	};
	return {
		...pkg,
		dependencies: replace(pkg.dependencies),
		devDependencies: replace(pkg.devDependencies),
	};
}

/**
 * The workspace root's `package.json`: runs the app's scripts from the root,
 * with the monorepo's pnpm and Node versions.
 */
export function rootPackageJson(
	app: string,
	pkg: PackageJson,
	monorepo: PackageJson,
): PackageJson {
	const scripts = Object.fromEntries(
		Object.keys(pkg.scripts ?? {}).map((name) => [
			name,
			name === "typecheck"
				? "pnpm --recursive typecheck"
				: `pnpm --filter ${pkg.name} ${name}`,
		]),
	);
	return {
		engines: monorepo.engines,
		name: `raf-query-${app}-example`,
		packageManager: monorepo.packageManager,
		private: true,
		scripts,
		type: "module",
		version: "0.0.0",
	};
}

/**
 * The monorepo's `pnpm-workspace.yaml` with the copy's packages, so the copy
 * keeps its overrides (`vite` is Vite+) and install settings. `undefined` if
 * it doesn't start with a `packages:` list.
 *
 * The copies install `@raf-query/*` minutes after it's published, so they're
 * exempt from pnpm's `minimumReleaseAge`.
 */
export function standaloneWorkspaceYaml(yaml: string) {
	const packages = /^packages:\n(?:[ \t]+- .*\n)+/;
	if (!packages.test(yaml)) {
		return undefined;
	}
	const exclude = '  - "@raf-query/*"\n';
	const copy = yaml.replace(
		packages,
		"packages:\n  - apps/*\n  - packages/*\n",
	);
	return /^minimumReleaseAgeExclude:\n/m.test(copy)
		? copy.replace(/^minimumReleaseAgeExclude:\n/m, (key) => key + exclude)
		: `${copy.trimEnd()}\n\nminimumReleaseAgeExclude:\n${exclude}`;
}

/** The port in the app's `dev` script (`--port <n>`). */
export function devPort(pkg: PackageJson) {
	const port = /--port (\d+)/.exec(pkg.scripts?.dev ?? "")?.[1];
	return port === undefined ? undefined : Number(port);
}

/**
 * The app's README with a note that it's a generated copy, and `## Run it`
 * replaced with the standalone commands. `undefined` if it has no `## Run it`.
 */
export function standaloneReadme(app: App, readme: string, port: number) {
	const [title, ...rest] = readme.split("\n");
	const [body, runIt] = rest.join("\n").split("\n## Run it\n");
	if (title === undefined || body === undefined || runIt === undefined) {
		return undefined;
	}
	return [
		title,
		"",
		`> A standalone copy of [\`examples/${app}\`](https://github.com/${repo}/tree/main/examples/${app}), generated for CodeSandbox on every release: edit the original, not this copy. The app is in \`apps/${app}\`; the UI components and fake database it shares with the other examples are in \`packages/\`.`,
		body.trimEnd(),
		"",
		"## Run it",
		"",
		`[Open it in CodeSandbox](${openUrl(app)}), or locally:`,
		"",
		"```shell",
		"pnpm install",
		"pnpm dev",
		"```",
		"",
		`Then open <http://localhost:${port}>.`,
		"",
	].join("\n");
}

/** `.codesandbox/tasks.json`: install, then start the dev server. */
function tasksJson(port: number) {
	return {
		$schema: "https://codesandbox.io/schemas/tasks.json",
		setupTasks: [{ command: "pnpm install", name: "Install dependencies" }],
		tasks: {
			build: { command: "pnpm build", name: "Production build" },
			dev: {
				command: "pnpm dev",
				name: "Dev server",
				preview: { port },
				runAtStart: true,
			},
			typecheck: { command: "pnpm typecheck", name: "Type check" },
		},
	};
}

/** `.codesandbox/template.json`: the name CodeSandbox shows for the copy. */
function templateJson(readme: string, pkg: PackageJson) {
	return {
		description: pkg.description,
		title: readme.split("\n")[0]?.replace(/^# /, ""),
	};
}

/**
 * `.devcontainer/devcontainer.json`. CodeSandbox's Node image, whose pnpm
 * switches itself to the root `packageManager`.
 */
function devcontainerJson(app: string) {
	return {
		image: "ghcr.io/codesandbox/devcontainers/typescript-node:24",
		name: `raf-query-${app}-example`,
	};
}

const gitignore = [
	"node_modules",
	".next",
	".output",
	".react-router",
	".tanstack",
	"build",
	"dist",
	"next-env.d.ts",
	"*.tsbuildinfo",
	"",
].join("\n");

const branchReadme = [
	"# raf-query examples for CodeSandbox",
	"",
	`Generated from [\`examples/\`](https://github.com/${repo}/tree/main/examples) by [\`tooling/codesandbox\`](https://github.com/${repo}/tree/main/tooling/codesandbox) after every release. Don't edit this branch: the next release overwrites it.`,
	"",
	...apps.map(
		(app) =>
			`- [\`examples/${app}\`](./examples/${app}): [open in CodeSandbox](${openUrl(app)})`,
	),
	"",
].join("\n");

type JsonFile =
	| PackageJson
	| ReturnType<typeof devcontainerJson>
	| ReturnType<typeof tasksJson>
	| ReturnType<typeof templateJson>;

const json = (value: JsonFile) => `${JSON.stringify(value, null, "\t")}\n`;

const readJson = Effect.fn("readJson")(function* (file: string) {
	const fs = yield* FileSystem.FileSystem;
	const text = yield* fs.readFileString(file);
	return yield* Effect.try({
		catch: (error) => new Error(`${file}: ${String(error)}`),
		try: (): PackageJson => JSON.parse(text),
	});
});

/** The `@raf-query/*` packages the copies install from npm, and their version. */
export const publishedVersions = Effect.fn("publishedVersions")(function* (
	root: string,
) {
	const path = yield* Path.Path;
	const published = new Map<string, string>();
	for (const name of ["core", "react"]) {
		const pkg = yield* readJson(
			path.join(root, "packages", name, "package.json"),
		);
		published.set(pkg.name, pkg.version);
	}
	return published;
});

/**
 * Replaces everything in `out` except `.git` with a workspace for each app, in
 * `out/examples/<app>`. Returns the workspaces' directories.
 */
export const writeCopies = Effect.fn("writeCopies")(function* (
	root: string,
	out: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	// Walks one level at a time so ignored directories (`node_modules` holds
	// tens of thousands of files) are never read.
	const copyTree: (
		from: string,
		to: string,
	) => Effect.Effect<void, PlatformError.PlatformError> = Effect.fn("copyTree")(
		function* (from: string, to: string) {
			for (const entry of yield* fs.readDirectory(from)) {
				if (isIgnored(entry, path.sep)) {
					continue;
				}
				const source = path.join(from, entry);
				const info = yield* fs.stat(source);
				if (info.type === "Directory") {
					yield* copyTree(source, path.join(to, entry));
				} else if (info.type === "File") {
					yield* fs.makeDirectory(to, { recursive: true });
					yield* fs.copyFile(source, path.join(to, entry));
				}
			}
		},
	);

	const published = yield* publishedVersions(root);
	const monorepo = yield* readJson(path.join(root, "package.json"));
	const workspaceYaml = standaloneWorkspaceYaml(
		yield* fs.readFileString(path.join(root, "pnpm-workspace.yaml")),
	);
	if (workspaceYaml === undefined) {
		return yield* Effect.fail(
			new Error("pnpm-workspace.yaml doesn't start with a `packages:` list"),
		);
	}
	const sharedDirs = yield* fs.readDirectory(
		path.join(root, "examples", ".shared"),
	);
	const workspacePackages = new Set<string>();
	for (const dir of sharedDirs) {
		const pkg = yield* readJson(
			path.join(root, "examples", ".shared", dir, "package.json"),
		);
		workspacePackages.add(pkg.name);
	}

	yield* fs.makeDirectory(out, { recursive: true });
	for (const entry of yield* fs.readDirectory(out)) {
		if (entry !== ".git") {
			yield* fs.remove(path.join(out, entry), { recursive: true });
		}
	}

	const targets: Array<string> = [];
	for (const app of apps) {
		const target = path.join(out, "examples", app);
		const appDir = path.join(target, "apps", app);
		const write = (file: string, contents: string) =>
			fs
				.makeDirectory(path.dirname(path.join(target, file)), {
					recursive: true,
				})
				.pipe(
					Effect.andThen(fs.writeFileString(path.join(target, file), contents)),
				);
		targets.push(target);
		yield* copyTree(path.join(root, "examples", app), appDir);
		for (const dir of sharedDirs) {
			yield* copyTree(
				path.join(root, "examples", ".shared", dir),
				path.join(target, "packages", dir),
			);
		}

		const pkg = yield* readJson(path.join(appDir, "package.json"));
		const port = devPort(pkg);
		if (port === undefined) {
			return yield* Effect.fail(
				new Error(`${app}: the dev script has no --port`),
			);
		}
		const standalone = yield* Effect.try({
			catch: (error) => new Error(`${app}: ${String(error)}`),
			try: () => standalonePackageJson(pkg, published, workspacePackages),
		});
		yield* write(`apps/${app}/package.json`, json(standalone));
		yield* write(
			"package.json",
			json(rootPackageJson(app, standalone, monorepo)),
		);

		const readme = yield* fs.readFileString(path.join(appDir, "README.md"));
		const standaloneReadmeText = standaloneReadme(app, readme, port);
		if (standaloneReadmeText === undefined) {
			return yield* Effect.fail(
				new Error(`${app}: README.md has no "## Run it" section`),
			);
		}
		yield* fs.remove(path.join(appDir, "README.md"));
		yield* write("README.md", standaloneReadmeText);

		const componentsJson = path.join(appDir, "components.json");
		const components = yield* fs.readFileString(componentsJson);
		yield* fs.writeFileString(
			componentsJson,
			components.replaceAll("../.shared/", "../../packages/"),
		);

		yield* write("pnpm-workspace.yaml", workspaceYaml);
		yield* write(".gitignore", gitignore);
		yield* write(".codesandbox/tasks.json", json(tasksJson(port)));
		yield* write(
			".codesandbox/template.json",
			json(templateJson(readme, standalone)),
		);
		yield* write(
			".devcontainer/devcontainer.json",
			json(devcontainerJson(app)),
		);
	}

	yield* fs.writeFileString(path.join(out, "README.md"), branchReadme);
	return targets;
});
