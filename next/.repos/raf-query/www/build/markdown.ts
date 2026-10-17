import rehypeShiki from "@shikijs/rehype";
import {
	createTransformerFactory,
	rendererRich,
	type TwoslashShikiFunction,
} from "@shikijs/twoslash/core";
import { Effect, FileSystem, Path } from "effect";
import GithubSlugger from "github-slugger";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import { toString } from "hast-util-to-string";
import type {
	Blockquote,
	Code,
	Link,
	Root as MdastRoot,
	Paragraph,
} from "mdast";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import type { ShikiTransformer } from "shiki";
import { createTwoslasher } from "twoslash/core";
// Twoslash runs the compiler through its JavaScript API, which TypeScript 7
// doesn't have.
import ts from "typescript6";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import type { DocHeading, DocSegment } from "../src/content/types.ts";
import { collapseRegions } from "./collapse.ts";
import { ContentError, messageOf } from "./content-error.ts";
import { appOf, sampleApps } from "./sample-apps.ts";
import type { TwoslashCache } from "./twoslash-cache.ts";

interface RenderedMarkdown {
	readonly demos: ReadonlyArray<string>;
	readonly headings: ReadonlyArray<DocHeading>;
	readonly segments: ReadonlyArray<DocSegment>;
	readonly text: string;
	/** Each `twoslash` block's `// ^?` types, in order. */
	readonly typeQueries: ReadonlyArray<ReadonlyArray<string>>;
}

const alertTitles = {
	CAUTION: "Caution",
	IMPORTANT: "Important",
	NOTE: "Note",
	TIP: "Tip",
	WARNING: "Warning",
} as const;

type AlertKind = keyof typeof alertTitles;

function isAlertKind(value: string): value is AlertKind {
	return Object.hasOwn(alertTitles, value);
}

/** GitHub's `> [!NOTE]` alerts become `<aside class="callout">`. */
function remarkAlerts() {
	return (tree: MdastRoot) => {
		visit(tree, "blockquote", (node: Blockquote) => {
			const first = node.children[0];
			if (first?.type !== "paragraph") {
				return;
			}
			const text = first.children[0];
			if (text?.type !== "text") {
				return;
			}
			const match = /^\[!(\w+)\]\s*/.exec(text.value);
			const kind = match?.[1]?.toUpperCase();
			if (!match || !kind || !isAlertKind(kind)) {
				return;
			}
			text.value = text.value.slice(match[0].length);
			const title: Paragraph = {
				children: [{ type: "text", value: alertTitles[kind] }],
				data: { hProperties: { className: ["callout-title"] } },
				type: "paragraph",
			};
			node.children.unshift(title);
			node.data = {
				hName: "aside",
				hProperties: {
					className: ["callout", `callout-${kind.toLowerCase()}`],
				},
			};
		});
	};
}

/**
 * Links between pages are written as `./caching.md#section`, so they work on
 * GitHub too; the site serves them at `/docs/caching#section`.
 */
function remarkDocLinks() {
	return (tree: MdastRoot) => {
		visit(tree, "link", (node: Link) => {
			const match = /^(?:\.\/)?([\w-]+)\.md(#[\w-]+)?$/.exec(node.url);
			if (match) {
				node.url = `/docs/${match[1]}${match[2] ?? ""}`;
			}
		});
	};
}

/**
 * A fenced block with the `demo` language embeds a live demo:
 *
 * ````md
 * ```demo
 * starting-queries
 * ```
 * ````
 */
function remarkDemos(demos: Array<string>) {
	return () => (tree: MdastRoot) => {
		visit(tree, "code", (node: Code, index, parent) => {
			if (node.lang !== "demo" || !parent || index === undefined) {
				return;
			}
			const id = node.value.trim();
			demos.push(id);
			parent.children[index] = {
				children: [],
				data: { hName: "raf-demo", hProperties: { dataDemo: id } },
				type: "paragraph",
			};
		});
	};
}

/**
 * A fence's meta (`twoslash title="src/queries.ts"`) is `data` on the hast
 * `<code>`, which `rehype-raw` drops. Shiki also reads it from the
 * `metastring` property, which survives.
 */
function remarkCodeMeta() {
	return (tree: MdastRoot) => {
		visit(tree, "code", (node: Code) => {
			if (node.meta) {
				node.data = {
					...node.data,
					hProperties: { ...node.data?.hProperties, metastring: node.meta },
				};
			}
		});
	};
}

/** Ids and anchor links for `h2` / `h3`, collected for the table of contents. */
function rehypeHeadings(headings: Array<DocHeading>) {
	return () => (tree: HastRoot) => {
		const slugger = new GithubSlugger();
		visit(tree, "element", (node: Element) => {
			if (node.tagName !== "h2" && node.tagName !== "h3") {
				return;
			}
			const text = toString(node).trim();
			const id = slugger.slug(text);
			node.properties.id = id;
			headings.push({ depth: node.tagName === "h2" ? 2 : 3, id, text });
			node.children = [
				{
					children: node.children,
					properties: { className: ["heading-anchor"], href: `#${id}` },
					tagName: "a",
					type: "element",
				},
			];
		});
	};
}

/** Keeps a fence's `title="…"` and language on the highlighted `<pre>`. */
const codeMeta: ShikiTransformer = {
	name: "raf-query-docs:code-meta",
	pre(node) {
		// oxlint-disable-next-line eslint/no-underscore-dangle -- Shiki's name for the fence's meta string
		const raw = this.options.meta?.__raw ?? "";
		const title = /title="([^"]+)"/.exec(raw)?.[1];
		if (title) {
			node.properties["data-title"] = title;
		}
		node.properties["data-language"] = this.options.lang;
		node.properties.tabindex = "0";
	},
};

/** Wraps each highlighted block with its title and a copy button. */
function rehypeCodeBlocks() {
	return (tree: HastRoot) => {
		visit(tree, "element", (node: Element, index, parent) => {
			if (node.tagName !== "pre" || !parent || index === undefined) {
				return;
			}
			const title = node.properties["data-title"];
			const header: Array<ElementContent> = [];
			if (title) {
				header.push({
					children: [{ type: "text", value: String(title) }],
					properties: { className: ["code-title"] },
					tagName: "div",
					type: "element",
				});
			}
			parent.children[index] = {
				children: [
					...header,
					node,
					{
						children: [{ type: "text", value: "Copy" }],
						properties: {
							ariaLabel: "Copy code",
							className: ["code-copy"],
							dataCopy: "",
							type: "button",
						},
						tagName: "button",
						type: "element",
					},
				],
				properties: { className: ["code-block"] },
				tagName: "div",
				type: "element",
			};
			return "skip";
		});
	};
}

/** Splits the page at each demo, so React renders demos between HTML runs. */
function toSegments(tree: HastRoot): Array<DocSegment> {
	const segments: Array<DocSegment> = [];
	let run: Array<HastRoot["children"][number]> = [];
	const flush = () => {
		const html = toHtml({ children: run, type: "root" }).trim();
		if (html) {
			segments.push({ html, kind: "html" });
		}
		run = [];
	};
	for (const child of tree.children) {
		if (child.type === "element" && child.tagName === "raf-demo") {
			flush();
			segments.push({ id: String(child.properties.dataDemo), kind: "demo" });
		} else {
			run.push(child);
		}
	}
	flush();
	return segments;
}

interface Project {
	readonly compilerOptions: ts.CompilerOptions;
	/**
	 * Every file of a sample app, by path from its root, so a block's
	 * program has what `tsc` has, like the route tree's `declare module`.
	 */
	readonly extraFiles: Record<string, string>;
}

function flatten(diagnostic: ts.Diagnostic) {
	return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

/**
 * A sample app's `tsconfig.json` and the files it includes, read for each
 * render, so a block sees edits to the rest of its app.
 */
const loadProject = Effect.fn("loadProject")(function* (app: string) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const file = path.join(app, "tsconfig.json");
	// TypeScript resolves `extends` and `include` itself, through `ts.sys`.
	const parsed = yield* Effect.try({
		catch: (cause) =>
			new ContentError({ cause, message: `${file}: ${messageOf(cause)}` }),
		try: () =>
			ts.getParsedCommandLineOfConfigFile(file, undefined, {
				...ts.sys,
				onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
					throw new Error(flatten(diagnostic));
				},
			}),
	});
	if (!parsed || parsed.errors.length) {
		return yield* new ContentError({
			message: `${file}: ${parsed?.errors.map(flatten).join("\n") ?? "invalid tsconfig"}`,
		});
	}
	const extraFiles = yield* Effect.forEach(
		parsed.fileNames,
		(name) =>
			Effect.map(
				fs.readFileString(name),
				(contents) =>
					[
						path.relative(app, name).split(path.sep).join("/"),
						contents,
					] as const,
			),
		{ concurrency: "unbounded" },
	);
	return {
		compilerOptions: parsed.options,
		extraFiles: Object.fromEntries(extraFiles),
	} satisfies Project;
});

/** The parts of a `@typescript/vfs` environment read here. */
interface Environment {
	createFile(fileName: string, content: string): void;
	readonly languageService: ts.LanguageService;
}

/**
 * Compiles a block, and returns the program it compiled in, for the cache to
 * know which files it read. `program` is missing if it wasn't seen.
 */
type Twoslasher = (...args: Parameters<TwoslashShikiFunction>) => {
	readonly program: ts.Program | undefined;
	readonly result: ReturnType<TwoslashShikiFunction>;
};

/** The program a block compiled in, once twoslash is done with it. */
interface SeenProgram {
	program?: ts.Program | undefined;
}

/** A twoslasher per project root; each keeps a TypeScript environment per set of compiler options. */
const twoslashers = new Map<string, Twoslasher>();

function twoslasherFor(root: string, tsLibDirectory: string) {
	const existing = twoslashers.get(root);
	if (existing) {
		return existing;
	}
	let onClear: ((program: ts.Program | undefined) => void) | undefined;
	// Twoslash empties a block's files once it's done with them; until then
	// the environment's program is the one the block compiled in.
	const environments = new (class extends Map<string, Environment> {
		override set(key: string, environment: Environment) {
			const createFile = environment.createFile.bind(environment);
			environment.createFile = (fileName, content) => {
				if (content === "" && onClear) {
					onClear(environment.languageService.getProgram());
					onClear = undefined;
				}
				createFile(fileName, content);
			};
			return super.set(key, environment);
		}
	})();
	const twoslasher = createTwoslasher({
		// @ts-expect-error -- typed as `@typescript/vfs`'s environment, from a package www doesn't depend on
		cache: environments,
		tsLibDirectory,
		// @ts-expect-error -- twoslash types `tsModule` as the `typescript` package, which here is TypeScript 7's, with no JavaScript API
		tsModule: ts,
		vfsRoot: root,
	});
	const run: Twoslasher = (code, lang, options) => {
		const seen: SeenProgram = {};
		onClear = (program) => {
			seen.program = program;
		};
		try {
			const result = twoslasher(code, lang, options);
			return { program: seen.program, result };
		} finally {
			onClear = undefined;
		}
	};
	twoslashers.set(root, run);
	return run;
}

const blockFilename = /^\/\/ @filename: (.+)$/gm;

/** The app whose `node_modules` inline blocks import from. */
const inlineApp = "tanstack-start";

/** An import of a file rather than a package. */
const fileImport = /\bfrom\s+["'](?:~\/|\.{1,2}\/)/;

/**
 * Fences with `twoslash` in their meta are compiled, so hovering a name shows
 * its type, `// ^?` pins a type under the line, and `// @errors: 2345` shows
 * an expected error. A compile error the block doesn't expect fails the
 * build.
 *
 * A `sample` fence's block (`expandSnippets`) is a file of a sample app
 * (`samples/<app>/`), named by its `// @filename`, a path from the samples
 * dir. It compiles in that app's project, with every file of the app, so it
 * sees what `tsc` sees: the route tree, the router context, the app's
 * `Register`.
 *
 * A block written inline stands alone: it imports packages only, and
 * compiles with `tanstack-start`'s compiler options and `node_modules` but
 * none of its files. A block that needs the app is a sample.
 */
const twoslashTransformer = Effect.fn("twoslashTransformer")(function* (
	markdown: string,
	samplesDir: string,
	cache: TwoslashCache | undefined,
) {
	const path = yield* Path.Path;
	const apps = yield* sampleApps(samplesDir);
	const appOfFile = (filename: string) =>
		appOf(path, path.join(samplesDir, filename), apps);
	const inline = path.join(samplesDir, inlineApp);
	const used = new Set([
		inline,
		...Array.from(markdown.matchAll(blockFilename), (match) =>
			appOfFile(match[1] ?? ""),
		).filter((app) => app !== undefined),
	]);
	const projects = new Map(
		yield* Effect.forEach(
			used,
			(app) =>
				Effect.map(loadProject(app), (project) => [app, project] as const),
			{ concurrency: "unbounded" },
		),
	);
	const tsLibDirectory = path.dirname(
		yield* path.fromFileUrl(new URL(import.meta.resolve("typescript6"))),
	);
	const session = cache ? yield* cache.open : undefined;
	const compile = (
		root: string,
		...[code, lang, options]: Parameters<TwoslashShikiFunction>
	) => {
		const key = session?.key({ code, lang, options, root });
		const cached = key === undefined ? undefined : session?.get(key);
		if (cached) {
			return cached;
		}
		const compiled = twoslasherFor(root, tsLibDirectory)(code, lang, options);
		const program = compiled.program;
		if (key !== undefined && program) {
			// The files under the root outside `node_modules` are the app's,
			// which the key covers, or a block's, which twoslash writes and
			// then empties. TypeScript's own libs come with the lockfile.
			const appFile = (fileName: string) =>
				fileName.startsWith(`${root}/`) &&
				!fileName.slice(root.length).includes("/node_modules/");
			session?.set(
				key,
				compiled.result,
				program
					.getSourceFiles()
					.filter(
						(file) =>
							!appFile(file.fileName) &&
							!program.isSourceFileDefaultLibrary(file),
					),
			);
		}
		return compiled.result;
	};
	const twoslasher: TwoslashShikiFunction = (code, lang, twoslashOptions) => {
		const filename = new RegExp(blockFilename.source, "m").exec(code)?.[1];
		if (filename === undefined) {
			if (fileImport.test(code)) {
				throw new Error(
					"An inline twoslash block imports a file. A block that needs the app's files is a `sample` fence of a file in samples/.",
				);
			}
			const project = projects.get(inline);
			return compile(inline, code, lang, {
				...twoslashOptions,
				...(project && { compilerOptions: project.compilerOptions }),
			});
		}
		const app = appOfFile(filename);
		const project = app && projects.get(app);
		if (!app || !project) {
			throw new Error(`"// @filename: ${filename}" isn't in a sample app`);
		}
		const inApp = code.replaceAll(
			blockFilename,
			(_line, name: string) =>
				`// @filename: ${path
					.relative(app, path.join(samplesDir, name))
					.split(path.sep)
					.join("/")}`,
		);
		return compile(app, inApp, lang, { ...twoslashOptions, ...project });
	};
	return {
		flush: session?.flush ?? Effect.void,
		transformer: createTransformerFactory(
			twoslasher,
			rendererRich({ jsdoc: false, queryRendering: "line" }),
		)({ explicitTrigger: true }),
	};
});

export interface RenderOptions {
	/** The dir of the sample apps the code blocks compile in. */
	readonly samplesDir: string;
	/** Where compiled blocks are kept between renders and builds. */
	readonly twoslashCache?: TwoslashCache | undefined;
}

export const renderMarkdown = Effect.fn("renderMarkdown")(function* (
	markdown: string,
	options: RenderOptions,
) {
	const headings: Array<DocHeading> = [];
	const demos: Array<string> = [];
	const typeQueries: Array<ReadonlyArray<string>> = [];
	let collapseId = 0;
	const blocks = yield* twoslashTransformer(
		markdown,
		options.samplesDir,
		options.twoslashCache,
	);
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkAlerts)
		.use(remarkDocLinks)
		.use(remarkDemos(demos))
		.use(remarkCodeMeta)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(rehypeHeadings(headings))
		.use(rehypeShiki, {
			defaultColor: false,
			// Loading all of Shiki's languages took seconds per process, so
			// others load on first use, and an unknown one fails the render. A
			// block in a language loaded on first use highlights after the rest,
			// so `ts` and `tsx` load up front: `typeQueries` is in page order.
			langs: ["ts", "tsx"],
			lazy: true,
			themes: { dark: "github-dark", light: "github-light" },
			transformers: [
				blocks.transformer,
				collapseRegions(() => {
					collapseId += 1;
					return `code-collapse-${collapseId}`;
				}),
				codeMeta,
				{
					name: "raf-query-docs:type-queries",
					pre() {
						const twoslash = this.meta.twoslash;
						if (twoslash) {
							typeQueries.push(
								twoslash.nodes.flatMap((node) =>
									node.type === "query" ? [node.text] : [],
								),
							);
						}
					},
				},
			],
		})
		.use(rehypeCodeBlocks);
	const tree = yield* Effect.tryPromise({
		catch: (cause) => new ContentError({ cause, message: messageOf(cause) }),
		try: async () => processor.run(processor.parse(markdown)),
	}).pipe(Effect.ensuring(blocks.flush));
	return {
		demos,
		headings,
		segments: toSegments(tree),
		text: toString(tree),
		typeQueries,
	} satisfies RenderedMarkdown;
});
