import { NodeServices } from "@effect/platform-node";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { Effect } from "effect";
import { defineConfig } from "vite";

import { docPages, docsContent } from "./build/content.ts";
import { sections, site } from "./src/site.ts";

const contentDir = new URL("content", import.meta.url).pathname;
const samplesDir = new URL("samples", import.meta.url).pathname;
const demosDir = new URL("src/demos", import.meta.url).pathname;
// Vercel keeps `node_modules` between builds, and CI caches this dir.
const twoslashCacheDir = new URL(
	"node_modules/.cache/twoslash",
	import.meta.url,
).pathname;
const lockfile = new URL("../pnpm-lock.yaml", import.meta.url).pathname;
const pages = await Effect.runPromise(
	docPages({ contentDir, samplesDir }).pipe(Effect.provide(NodeServices.layer)),
);

export default defineConfig({
	plugins: [
		docsContent({
			contentDir,
			demosDir,
			demosUrl: `${site.github}/blob/main/www/src/demos`,
			samplesDir,
			sections,
			siteUrl: site.url,
			twoslashCache: { dir: twoslashCacheDir, inputs: [lockfile] },
		}),
		tailwindcss(),
		tanstackStart({
			pages: [
				{ path: "/", sitemap: { changefreq: "weekly", priority: 1 } },
				...pages.map((page) => ({
					path: page.path,
					sitemap: {
						changefreq: "weekly" as const,
						lastmod: page.lastModified,
						priority: 0.8,
					},
				})),
				{
					path: "/404",
					prerender: { enabled: true, outputPath: "/404.html" },
					sitemap: { exclude: true },
				},
			],
			prerender: {
				crawlLinks: true,
				enabled: true,
				failOnError: true,
				// `/` already renders every framework mode from `?mode=`; the
				// crawler finds those links but they aren't separate pages.
				filter: (page) => page.path !== "/docs" && !page.path.includes("?"),
			},
			sitemap: { enabled: true, host: site.url },
		}),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
	],
	resolve: {
		tsconfigPaths: true,
	},
});
