#!/usr/bin/env node
/**
 * Bundle one raf-query fixture app and list the modules that end up in it,
 * largest first (bytes as rendered into the chunk, before minification).
 * Use it to find what to cut after `measure.ts` shows a size change.
 *
 * Usage: node src/analyze.ts [export] [module] [--top N]
 *   export  fixture export to render (default `queryApp`)
 *   module  fixture module under `fixtures/raf-query/` (default `apps.tsx`)
 */
import { gzipSync } from "node:zlib";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { Console, Effect, FileSystem, Path } from "effect";
import { build } from "vite";

const reactExternal = /^(react|react-dom|scheduler)($|\/)/;
const routerExternal = /^@tanstack\/(history|react-router|router-core)($|\/)/;

Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const packageDir = path.join(import.meta.dirname, "..");
	const cacheDir = path.join(packageDir, "node_modules/.cache/bundle-size");
	const argv = process.argv.slice(2);
	const topIndex = argv.indexOf("--top");
	const top = topIndex === -1 ? 40 : Number(argv[topIndex + 1]);
	const args = argv.filter(
		(arg, index) =>
			!arg.startsWith("--") && (topIndex === -1 || index !== topIndex + 1),
	);
	const [appExport = "queryApp", appModule = "apps.tsx"] = args;
	yield* fs.makeDirectory(cacheDir, { recursive: true });

	const input = path.join(cacheDir, "analyze.js");
	yield* fs.writeFileString(
		input,
		[
			`import { createRoot } from "react-dom/client";`,
			`import { ${appExport} } from ${JSON.stringify(path.join(packageDir, "fixtures/raf-query", appModule))};`,
			appExport === "createAppRouter"
				? `import { RouterProvider } from "@tanstack/react-router"; import { createElement } from "react"; createRoot(document.body).render(createElement(RouterProvider, { router: createAppRouter() }));`
				: `createRoot(document.body).render(await ${appExport}());`,
		].join("\n"),
	);
	const result = yield* Effect.promise(() =>
		build({
			build: {
				minify: true,
				modulePreload: false,
				rolldownOptions: {
					external: [reactExternal, routerExternal],
					input,
				},
				write: false,
			},
			configFile: false,
			logLevel: "silent",
			mode: "production",
			plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
			root: packageDir,
		}),
	);
	const outputs = Array.isArray(result)
		? result
		: "output" in result
			? [result]
			: [];
	const chunks = outputs
		.flatMap((output) => output.output)
		.flatMap((file) => (file.type === "chunk" ? [file] : []));
	const gzip = chunks.reduce(
		(sum, chunk) => sum + gzipSync(chunk.code, { level: 9 }).length,
		0,
	);
	const modules = chunks
		.flatMap((file) => Object.entries(file.modules))
		.map(([id, info]) => ({
			bytes: info.renderedLength,
			id: id.replace(/^.*node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?/, ""),
		}))
		.filter((module) => module.bytes > 0)
		.toSorted((a, b) => b.bytes - a.bytes);
	const total = modules.reduce((sum, module) => sum + module.bytes, 0);
	yield* Console.log(
		`${appExport}: ${(gzip / 1024).toFixed(2)} kB gzip, ${total} bytes before minification; by module:\n`,
	);
	for (const module of modules.slice(0, top)) {
		yield* Console.log(`${String(module.bytes).padStart(7)}  ${module.id}`);
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
