import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { Connect, Plugin } from "vite";
import { removeTwoslashNotations } from "twoslash/fallback";
import { parse as parseYaml } from "yaml";

import type { Doc, DocMeta, DocSection, Sample } from "../src/content/types.ts";
import { stripCollapseMarkers } from "./collapse.ts";
import { ContentError, messageOf } from "./content-error.ts";
import { generateRouteTrees, generateRouteTypes } from "./sample-apps.ts";
import { renderMarkdown } from "./markdown.ts";
import { expandSnippets } from "./snippets.ts";
import {
	makeTwoslashCache,
	type TwoslashCacheOptions,
} from "./twoslash-cache.ts";

export interface ContentDirs {
	/** Directory of the `.md` pages, as an absolute path. */
	readonly contentDir: string;
	/** Directory of the sample apps the pages' code blocks compile in. */
	readonly samplesDir: string;
}

export interface ContentOptions extends ContentDirs {
	/** Directory with one `<id>.tsx` per demo. */
	readonly demosDir: string;
	/** Where `demosDir` is browsable, for the markdown pages' demo links. */
	readonly demosUrl: string;
	/** Sidebar sections, in order. Every page's `section` must be one of them. */
	readonly sections: ReadonlyArray<string>;
	/** Absolute site URL, for `llms.txt` and the markdown pages. */
	readonly siteUrl: string;
	/** Keeps compiled code blocks on disk, so the next build reuses them. */
	readonly twoslashCache?: TwoslashCacheOptions | undefined;
}

/** The `Accept` header agents send to get markdown instead of HTML. */
const acceptsMarkdown = /\btext\/markdown\b/;

const Frontmatter = Schema.Struct({
	description: Schema.String,
	order: Schema.Number,
	section: Schema.String,
	title: Schema.String,
});

type Frontmatter = typeof Frontmatter.Type;

const decodeFrontmatter = Schema.decodeUnknownEffect(Frontmatter);

interface Source {
	readonly file: string;
	readonly frontmatter: Frontmatter;
	/** With `sample` fences expanded into `twoslash` blocks. */
	readonly markdown: string;
	readonly slug: string;
	/** The files the page includes. */
	readonly snippets: ReadonlyArray<string>;
}

/** Replaces each `// ^?` in a Twoslash block with the type it shows, as a comment. */
function withTypes(code: string, types: ReadonlyArray<string>) {
	let index = 0;
	return code.replaceAll(/^([ \t]*)\/\/\s*\^\?[ \t]*$/gm, (marker, indent) => {
		const type = types[index] ?? "";
		index++;
		return type
			.split("\n")
			.map((line) => `${indent}// ${line}`)
			.join("\n");
	});
}

const manifestId = "virtual:docs-manifest";
const resolvedManifestId = `\0${manifestId}`;

/**
 * `import hero from "sample:<app>/<path>#region"` renders that region of a
 * sample app's file, as a `sample` fence does, for code outside the pages.
 */
const samplePrefix = "sample:";
const resolvedSamplePrefix = `\0${samplePrefix}`;

const parseSource = Effect.fn("parseSource")(function* (
	dirs: ContentDirs,
	file: string,
	raw: string,
) {
	const path = yield* Path.Path;
	const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
	if (!match?.[1]) {
		return yield* new ContentError({ message: `${file}: missing frontmatter` });
	}
	const yaml = match[1];
	const frontmatter = yield* Effect.try(() => parseYaml(yaml)).pipe(
		Effect.flatMap(decodeFrontmatter),
		Effect.mapError(
			(cause) =>
				new ContentError({
					cause,
					message: `${file}: invalid frontmatter: ${messageOf(cause)}`,
				}),
		),
	);
	const expanded = yield* expandSnippets(raw.slice(match[0].length), {
		file,
		samplesDir: dirs.samplesDir,
	});
	return {
		file,
		frontmatter,
		markdown: expanded.markdown,
		slug: path.basename(file, ".md"),
		snippets: expanded.files,
	} satisfies Source;
});

/** When `file` last changed in git, if it's committed. */
const lastModified = Effect.fn("lastModified")(
	function* (file: string) {
		const path = yield* Path.Path;
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		const date = yield* spawner.string(
			ChildProcess.make("git", ["log", "-1", "--format=%cI", "--", file], {
				cwd: path.dirname(file),
				stderr: "ignore",
			}),
		);
		return date.trim() || undefined;
	},
	Effect.orElseSucceed(() => undefined),
);

const readSources = Effect.fn("readSources")(function* (dirs: ContentDirs) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const names = yield* fs.readDirectory(dirs.contentDir);
	return yield* Effect.forEach(
		names.filter((name) => name.endsWith(".md")),
		(name) => {
			const file = path.join(dirs.contentDir, name);
			return Effect.flatMap(fs.readFileString(file), (raw) =>
				parseSource(dirs, file, raw),
			);
		},
		{ concurrency: "unbounded" },
	);
});

/** Page paths for prerendering and the sitemap. */
export const docPages = Effect.fn("docPages")(function* (dirs: ContentDirs) {
	return yield* Effect.forEach(
		yield* readSources(dirs),
		(source) =>
			Effect.map(lastModified(source.file), (date) => ({
				lastModified: date,
				path: `/docs/${source.slug}`,
			})),
		{ concurrency: "unbounded" },
	);
});

/** Runs a build step from one of Vite's hooks. */
function run<A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) {
	return Effect.runPromise(Effect.provide(effect, NodeServices.layer));
}

/**
 * Compiles `content/*.md` at build time. Each page imports as a module of
 * pre-highlighted HTML segments (its own chunk, so the browser loads only the
 * pages it visits), and `virtual:docs-manifest` lists every page for the nav,
 * search and SEO. The client build also gets `llms.txt` and each page's
 * markdown source at `/docs/<slug>.md`.
 */
export function docsContent(options: ContentOptions): Plugin {
	const { samplesDir } = options;
	const twoslashCache =
		options.twoslashCache && makeTwoslashCache(options.twoslashCache);
	const rendered = new Map<string, Promise<Doc>>();
	/** Each page's `twoslash` types, by file, for its markdown. */
	const typeQueries = new Map<string, ReadonlyArray<ReadonlyArray<string>>>();

	const renderDoc = Effect.fn("renderDoc")(function* (source: Source) {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const result = yield* renderMarkdown(source.markdown, {
			samplesDir,
			twoslashCache,
		}).pipe(
			Effect.mapError(
				(error) =>
					new ContentError({
						cause: error,
						message: `${source.file}: ${error.message}`,
					}),
			),
		);
		for (const id of result.demos) {
			if (!(yield* fs.exists(path.join(options.demosDir, `${id}.tsx`)))) {
				return yield* new ContentError({
					message: `${source.file}: unknown demo "${id}"`,
				});
			}
		}
		typeQueries.set(source.file, result.typeQueries);
		return {
			demos: result.demos,
			description: source.frontmatter.description,
			headings: result.headings,
			lastModified: yield* lastModified(source.file),
			section: source.frontmatter.section,
			segments: result.segments,
			slug: source.slug,
			title: source.frontmatter.title,
		} satisfies Doc;
	});

	const renderSample = Effect.fn("renderSample")(function* (spec: string) {
		const file = `${samplePrefix}${spec}`;
		const expanded = yield* expandSnippets(`\`\`\`sample\n${spec}\n\`\`\``, {
			file,
			samplesDir,
		});
		const result = yield* renderMarkdown(expanded.markdown, {
			samplesDir,
			twoslashCache,
		}).pipe(
			Effect.mapError(
				(error) =>
					new ContentError({
						cause: error,
						message: `${file}: ${error.message}`,
					}),
			),
		);
		return {
			files: expanded.files,
			sample: { segments: result.segments } satisfies Sample,
		};
	});

	function render(source: Source): Promise<Doc> {
		const cached = rendered.get(source.file);
		if (cached) {
			return cached;
		}
		const doc = run(renderDoc(source));
		rendered.set(source.file, doc);
		return doc;
	}

	async function manifest(): Promise<ReadonlyArray<DocSection>> {
		const sources = await run(readSources(options));
		for (const source of sources) {
			if (!options.sections.includes(source.frontmatter.section)) {
				throw new Error(
					`${source.file}: section "${source.frontmatter.section}" isn't one of ${options.sections.join(", ")}`,
				);
			}
		}
		const docs = await Promise.all(
			sources.map(async (source) => ({
				doc: await render(source),
				order: source.frontmatter.order,
			})),
		);
		return options.sections.map((title) => ({
			docs: docs
				.filter((entry) => entry.doc.section === title)
				.toSorted((a, b) => a.order - b.order)
				.map((entry): DocMeta => ({
					demos: entry.doc.demos,
					description: entry.doc.description,
					headings: entry.doc.headings,
					lastModified: entry.doc.lastModified,
					section: entry.doc.section,
					slug: entry.doc.slug,
					title: entry.doc.title,
				})),
			title,
		}));
	}

	const intro = [
		"# raf-query",
		"",
		"> Render-as-you-fetch data fetching for React: queries start in route loaders and React Server Components, travel to components as serializable handles, and are read with `use()` under Suspense.",
		"",
	];

	/**
	 * A page as agents read it: links point at the other pages' markdown, each
	 * demo, which only runs in a browser, becomes a link to the page and to the
	 * demo's code, and `twoslash` blocks lose their hidden setup and markers,
	 * with each `// ^?` replaced by the type it shows on the web.
	 */
	function pageMarkdown(source: Source) {
		const url = `${options.siteUrl}/docs/${source.slug}`;
		const types = typeQueries.get(source.file) ?? [];
		let blockIndex = 0;
		const body = stripCollapseMarkers(source.markdown)
			.replaceAll(
				/^```(\w+)([^\n]*)\btwoslash\b([^\n]*)\n([\s\S]*?)^```$/gm,
				(fence, lang, before, after, code) => {
					const queries = types[blockIndex] ?? [];
					blockIndex++;
					return `\`\`\`${lang}${`${before.trimEnd()}${after}`.trimEnd()}\n${removeTwoslashNotations(withTypes(code, queries))}\`\`\``;
				},
			)
			.replaceAll(
				/\]\((?:\.\/)?([\w-]+)\.md(#[\w-]+)?\)/g,
				(link, slug, hash) =>
					`](${options.siteUrl}/docs/${slug}.md${hash ?? ""})`,
			)
			.replaceAll(
				/^```demo\n([\w-]+)\n```$/gm,
				(block, id) =>
					`> [!NOTE]\n> The [web version of this page](${url}) has an interactive demo here. Its code: [${id}.tsx](${options.demosUrl}/${id}.tsx).`,
			);
		return [
			`# ${source.frontmatter.title}`,
			"",
			`> ${source.frontmatter.description}`,
			"",
			body.trim(),
			"",
		].join("\n");
	}

	/** `llms.txt` (https://llmstxt.org): what the library is, and every page. */
	function llmsTxt(sections: ReadonlyArray<DocSection>) {
		const lines = [
			...intro,
			"Every page is also markdown: add `.md` to its URL, or request it with `Accept: text/markdown`.",
			"",
		];
		for (const section of sections) {
			lines.push(`## ${section.title}`, "");
			for (const doc of section.docs) {
				lines.push(
					`- [${doc.title}](${options.siteUrl}/docs/${doc.slug}.md): ${doc.description}`,
				);
			}
			lines.push("");
		}
		lines.push(
			"## Optional",
			"",
			`- [Full documentation](${options.siteUrl}/llms-full.txt): every page above in one file`,
			"",
		);
		return lines.join("\n");
	}

	/**
	 * Files for agents, by URL path: `llms.txt`, `llms-full.txt`, each page's
	 * markdown at `/docs/<slug>.md`, `/index.md` (the home page's markdown,
	 * the same as `llms.txt`) and `/404.md`.
	 */
	async function agentFiles() {
		const sections = await manifest();
		const sources = new Map(
			(await run(readSources(options))).map((source) => [source.slug, source]),
		);
		const pages = sections
			.flatMap((section) => section.docs)
			.flatMap((doc) => {
				const source = sources.get(doc.slug);
				return source ? [source] : [];
			});
		const files = new Map<string, string>();
		files.set("/llms.txt", llmsTxt(sections));
		files.set("/index.md", llmsTxt(sections));
		files.set(
			"/404.md",
			`# Not found\n\nThere is no page at this URL. [llms.txt](${options.siteUrl}/llms.txt) lists every page.\n`,
		);
		files.set(
			"/llms-full.txt",
			[
				...intro,
				...pages.map(
					(source) =>
						`---\n\nSource: ${options.siteUrl}/docs/${source.slug}\n\n${pageMarkdown(source)}`,
				),
			].join("\n"),
		);
		for (const source of pages) {
			files.set(`/docs/${source.slug}.md`, pageMarkdown(source));
		}
		return files;
	}

	/**
	 * The dev and preview servers answer like the deployed site
	 * (`build/vercel-output.ts`): agent files at their paths, and a page's
	 * markdown at the page's own URL for `Accept: text/markdown`.
	 */
	function serveAgentFiles(server: { readonly middlewares: Connect.Server }) {
		server.middlewares.use((request, response, next) => {
			const { pathname } = new URL(request.url ?? "/", "http://localhost");
			const wantsMarkdown = acceptsMarkdown.test(request.headers.accept ?? "");
			const filePath =
				wantsMarkdown && /^\/(?:docs\/[\w-]+)?$/.test(pathname)
					? `${pathname === "/" ? "/index" : pathname}.md`
					: pathname;
			if (!/\.(?:md|txt)$/.test(filePath) || filePath === "/robots.txt") {
				next();
				return;
			}
			agentFiles().then((files) => {
				const file = files.get(filePath) ?? files.get("/404.md");
				if (file === undefined || (!wantsMarkdown && !files.has(filePath))) {
					next();
					return;
				}
				response.statusCode = files.has(filePath) ? 200 : 404;
				response.setHeader(
					"Content-Type",
					filePath.endsWith(".md")
						? "text/markdown; charset=utf-8"
						: "text/plain; charset=utf-8",
				);
				response.setHeader("Vary", "Accept");
				response.end(file);
			}, next);
		});
	}

	let generated: Promise<unknown> | undefined;

	return {
		async buildStart() {
			generated ??= run(
				Effect.all(
					[generateRouteTrees(samplesDir), generateRouteTypes(samplesDir)],
					{ concurrency: "unbounded" },
				),
			);
			await generated;
		},
		configurePreviewServer: serveAgentFiles,
		configureServer: serveAgentFiles,
		async generateBundle() {
			if (this.environment.name !== "client") {
				return;
			}
			for (const [urlPath, source] of await agentFiles()) {
				this.emitFile({ fileName: urlPath.slice(1), source, type: "asset" });
			}
			if (twoslashCache) {
				this.environment.logger.info(
					`twoslash: ${twoslashCache.stats.hits} code blocks from the cache, ${twoslashCache.stats.misses} compiled`,
				);
			}
		},
		hotUpdate(context) {
			if (
				!context.file.startsWith(options.contentDir) &&
				!context.file.startsWith(samplesDir)
			) {
				return undefined;
			}
			rendered.delete(context.file);
			const graph = this.environment.moduleGraph;
			const stale = [...graph.idToModuleMap].flatMap(([id, module]) =>
				id === resolvedManifestId ||
				(context.file.startsWith(samplesDir) &&
					id.startsWith(resolvedSamplePrefix))
					? [module]
					: [],
			);
			for (const module of stale) {
				graph.invalidateModule(module);
			}
			return stale.length ? [...context.modules, ...stale] : undefined;
		},
		async load(id) {
			if (id.startsWith(resolvedSamplePrefix)) {
				const output = await run(
					renderSample(id.slice(resolvedSamplePrefix.length)),
				);
				for (const file of output.files) {
					this.addWatchFile(file);
				}
				return `export default ${JSON.stringify(output.sample)};`;
			}
			if (id !== resolvedManifestId) {
				return undefined;
			}
			const sections = await manifest();
			return `export const sections = ${JSON.stringify(sections)};`;
		},
		name: "raf-query-docs:content",
		resolveId(id) {
			if (id.startsWith(samplePrefix)) {
				return `\0${id}`;
			}
			return id === manifestId ? resolvedManifestId : undefined;
		},
		// One plugin instance across client/SSR so `rendered` is shared; without
		// this each environment re-runs Twoslash for every page.
		sharedDuringBuild: true,
		async transform(code, id) {
			const file = id.split("?")[0] ?? id;
			if (!file.startsWith(options.contentDir) || !file.endsWith(".md")) {
				return undefined;
			}
			const source = await run(parseSource(options, file, code));
			for (const snippet of source.snippets) {
				this.addWatchFile(snippet);
			}
			// Drop the cache only in dev: during build, client and SSR both
			// transform the same files and must reuse the shared render.
			// (Snippet edits re-run transform with unchanged markdown.)
			if (this.environment.mode === "dev") {
				rendered.delete(file);
			}
			const doc = await render(source);
			return { code: `export default ${JSON.stringify(doc)};`, map: null };
		},
	};
}
