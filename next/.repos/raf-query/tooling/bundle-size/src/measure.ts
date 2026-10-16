#!/usr/bin/env node
/**
 * Bundle the same small apps written with TanStack Query, with raf-query's
 * experimental TanStack-backed package, and with raf-query, and print their
 * minified / gzip sizes as Markdown. The fixtures (`fixtures/*`) mirror the
 * TanStack Start example: factories built with `queryOptions`, loaders that
 * prefetch, components that read with `useQuery`, form actions that
 * invalidate. They build with the Start example's bundler setup: Vite
 * (Rolldown) with `@vitejs/plugin-react` and the React Compiler. React and
 * TanStack Router are external, since an app ships them either way.
 *
 * The full Start example apps are built and measured too (client JS only).
 *
 * Usage: node src/measure.ts [--dist] [--no-apps]
 *   --dist     bundle the packages' built `dist/` (run `pnpm build` first),
 *              which is what npm users get, instead of their `src/`
 *   --no-apps  skip building the example apps
 */
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { Console, Effect, FileSystem, Path } from "effect";
import { build } from "vite";

type Library = "raf-on-tanstack" | "raf-query" | "tanstack-query";

const libraries: ReadonlyArray<{
	readonly id: Library;
	readonly name: string;
}> = [
	{ id: "tanstack-query", name: "TanStack Query" },
	{ id: "raf-on-tanstack", name: "raf-query on TanStack (experimental)" },
	{ id: "raf-query", name: "raf-query" },
];

interface Scenario {
	/** Fixture module and export that builds the app. */
	readonly app: { readonly export: string; readonly module: string };
	readonly libraries: ReadonlyArray<Library>;
	readonly name: string;
}

const allLibraries = libraries.map((library) => library.id);

const scenarios: ReadonlyArray<Scenario> = [
	{
		app: { export: "queryApp", module: "apps.tsx" },
		libraries: allLibraries,
		name: "Factory + prefetch + `useQuery`",
	},
	{
		app: { export: "pagedApp", module: "apps.tsx" },
		libraries: allLibraries,
		name: "+ paged query with Load more",
	},
	{
		app: { export: "actionsApp", module: "apps.tsx" },
		libraries: allLibraries,
		name: "+ form action that invalidates",
	},
	{
		app: { export: "createAppRouter", module: "router.tsx" },
		libraries: allLibraries,
		name: "TanStack Router app (loaders + SSR integration)",
	},
	{
		app: { export: "effectApp", module: "effect.tsx" },
		libraries: ["raf-query"],
		name: "Effect `queryFn` + `Schedule` retry",
	},
];

const exampleApps = [
	{
		dir: ".experimental/tanstack-query/start",
		library: "raf-on-tanstack",
	},
	{ dir: "examples/tanstack-start", library: "raf-query" },
] as const;

const reactExternal = /^(react|react-dom|scheduler)($|\/)/;
const routerExternal = /^@tanstack\/(history|react-router|router-core)($|\/)/;
const effectExternal = /^effect($|\/)/;

interface Size {
	readonly gzip: number;
	readonly min: number;
}

function sizeOf(chunks: ReadonlyArray<string>): Size {
	let min = 0;
	let gzip = 0;
	for (const code of chunks) {
		const buffer = Buffer.from(code);
		min += buffer.length;
		gzip += gzipSync(buffer, { level: 9 }).length;
	}
	return { gzip, min };
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(2)} kB`;
const cell = (size: Size | undefined, pick: (size: Size) => number) =>
	size ? kb(pick(size)) : "—";

function entrySource(scenario: Scenario, appModule: string) {
	const render =
		scenario.app.export === "createAppRouter"
			? `createElement(RouterProvider, { router: createAppRouter() })`
			: `await ${scenario.app.export}()`;
	return [
		`import { createElement } from "react";`,
		`import { createRoot } from "react-dom/client";`,
		`import { RouterProvider } from "@tanstack/react-router";`,
		`import { ${scenario.app.export} } from ${JSON.stringify(appModule)};`,
		`createRoot(document.body).render(${render});`,
	].join("\n");
}

Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const packageDir = path.join(import.meta.dirname, "..");
	const root = path.join(packageDir, "../..");
	const cacheDir = path.join(packageDir, "node_modules/.cache/bundle-size");
	const dist = process.argv.includes("--dist");
	yield* fs.makeDirectory(cacheDir, { recursive: true });

	const source = (pkg: string, module: string) =>
		path.join(
			root,
			"packages",
			pkg,
			dist ? `dist/${module}.mjs` : `src/${module}.ts`,
		);
	const alias = dist
		? [
				{ find: /^@raf-query\/core$/, replacement: source("core", "index") },
				{ find: /^@raf-query\/react$/, replacement: source("react", "index") },
				{
					find: /^@raf-query\/react\/tanstack-router$/,
					replacement: source("react", "tanstack-router-browser"),
				},
			]
		: [];

	const bundle = Effect.fn("bundle")(function* (
		name: string,
		code: string,
		external: ReadonlyArray<RegExp>,
	) {
		const input = path.join(cacheDir, `${name}.js`);
		yield* fs.writeFileString(input, code);
		const result = yield* Effect.promise(() =>
			build({
				build: {
					minify: true,
					modulePreload: false,
					rolldownOptions: { external: [...external], input },
					write: false,
				},
				configFile: false,
				logLevel: "silent",
				mode: "production",
				plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
				resolve: { alias },
				root: packageDir,
			}),
		);
		const outputs = Array.isArray(result)
			? result
			: "output" in result
				? [result]
				: [];
		return sizeOf(
			outputs.flatMap((output) =>
				output.output.flatMap((file) =>
					file.type === "chunk" ? [file.code] : [],
				),
			),
		);
	});

	const rows = [];
	for (const [index, scenario] of scenarios.entries()) {
		const sizes = new Map<Library, Size>();
		let effectShare: number | undefined;
		for (const library of scenario.libraries) {
			const appModule = path.join(
				packageDir,
				"fixtures",
				library,
				scenario.app.module,
			);
			const code = entrySource(scenario, appModule);
			const external = [reactExternal, routerExternal];
			const size = yield* bundle(`${index}-${library}`, code, external);
			sizes.set(library, size);
			if (library === "raf-query") {
				const withoutEffect = yield* bundle(
					`${index}-${library}-no-effect`,
					code,
					[...external, effectExternal],
				);
				effectShare = size.gzip - withoutEffect.gzip;
			}
		}
		rows.push({ effectShare, name: scenario.name, sizes });
	}

	const header = libraries.map((library) => library.name);
	yield* Console.log(
		`Fixture apps, ${dist ? "packages' dist/" : "packages' src/"}, gzip (minified in parentheses):\n`,
	);
	yield* Console.log(
		`| App | ${header.join(" | ")} | Effect's share of raf-query |`,
	);
	yield* Console.log(`| --- | ${header.map(() => "--:").join(" | ")} | --: |`);
	for (const row of rows) {
		const cells = libraries.map((library) => {
			const size = row.sizes.get(library.id);
			return size ? `${kb(size.gzip)} (${kb(size.min)})` : "—";
		});
		yield* Console.log(
			`| ${row.name} | ${cells.join(" | ")} | ${row.effectShare === undefined ? "—" : kb(row.effectShare)} |`,
		);
	}
	yield* Console.log(
		"\nApp code is identical across columns; only the query library differs.",
	);

	if (process.argv.includes("--no-apps")) {
		return;
	}
	yield* Console.log(
		"\nFull TanStack Start example apps (client JS, all chunks; same app, same bundler):\n",
	);
	yield* Console.log("| App | Library | gzip | minified |");
	yield* Console.log("| --- | --- | --: | --: |");
	for (const app of exampleApps) {
		const dir = path.join(root, app.dir);
		yield* Effect.sync(() =>
			execFileSync(path.join(dir, "node_modules/.bin/vp"), ["build"], {
				cwd: dir,
				stdio: "ignore",
			}),
		);
		const assets = path.join(dir, ".output/public/assets");
		const files = (yield* fs.readDirectory(assets)).filter((file) =>
			file.endsWith(".js"),
		);
		const chunks = [];
		for (const file of files) {
			chunks.push(yield* fs.readFileString(path.join(assets, file)));
		}
		const size = sizeOf(chunks);
		const library =
			libraries.find((entry) => entry.id === app.library)?.name ?? "";
		yield* Console.log(
			`| \`${app.dir}\` | ${library} | ${cell(size, (s) => s.gzip)} | ${cell(size, (s) => s.min)} |`,
		);
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
