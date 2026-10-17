import { Effect, FileSystem, Path } from "effect";

import { ContentError } from "./content-error.ts";
import { appOf, sampleApps } from "./sample-apps.ts";

interface ExpandedSnippets {
	/** Every file the page includes, for the dev server to watch. */
	readonly files: ReadonlyArray<string>;
	readonly markdown: string;
}

/**
 * A `sample` fence: its one line is a path from the samples dir, an optional
 * `#region`, and the fence's meta an optional `title="…"`. Paths may contain
 * `[param]` segments (Next.js).
 */
const sampleFence =
	/^```sample([^\n]*)\n([^\n#]+?)(?:#([\w-]+))?[ \t]*\n```$/gm;
const regionMarker =
	/^[ \t]*(?:\/\/ ?#(region|endregion)\b[ \t]*([\w-]*)|<!-- ?#(region|endregion)\b[ \t]*([\w-]*)[ \t]*-->)[ \t]*$/;
/** Component files: highlighted as they are, since Twoslash compiles TypeScript only. */
const componentLangs = new Set(["svelte", "vue"]);
const queryMarker = /^[ \t]*\/\/\s*\^\?[ \t]*$/;
/** `// @ts-expect-error -- 2345: why`, which a block shows as the error. */
const expectedError = /^[ \t]*\/\/ @ts-expect-error -- (\d+)\b.*$/;

function dedent(lines: ReadonlyArray<string>) {
	const indents = lines
		.filter((line) => line.trim())
		.map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
	const indent = indents.length ? Math.min(...indents) : 0;
	return lines.map((line) => line.slice(indent));
}

interface Line {
	readonly shown: boolean;
	readonly text: string;
}

/**
 * Marks each line of `code` as in `region` or not (all of them when it's
 * undefined). A region can appear more than once, and its parts are shown
 * together. Every `// #region` / `// #endregion` line is dropped, and a
 * `// ^?` outside the region too, so a file can hold several regions with
 * their own queries.
 */
const markRegion = Effect.fn("markRegion")(function* (
	code: string,
	region: string | undefined,
	file: string,
) {
	const lines: Array<Line> = [];
	const open: Array<string> = [];
	let found = !region;
	for (const [index, text] of code.trimEnd().split("\n").entries()) {
		const marker = regionMarker.exec(text);
		if (!marker) {
			const shown = !region || open.includes(region);
			if (shown || !queryMarker.test(text)) {
				lines.push({ shown, text });
			}
			continue;
		}
		const kind = marker[1] ?? marker[3];
		const name = marker[2] ?? marker[4] ?? "";
		if (kind === "region") {
			open.push(name);
			found ||= name === region;
			continue;
		}
		const closed = open.pop();
		if (closed === undefined || (name && name !== closed)) {
			return yield* new ContentError({
				message: `${file}:${index + 1}: "// #endregion ${name}" doesn't close a region`,
			});
		}
	}
	if (!found) {
		return yield* new ContentError({
			message: `${file}: no "// #region ${region}"`,
		});
	}
	if (open.length) {
		return yield* new ContentError({
			message: `${file}: "// #region ${open.join(", ")}" isn't closed`,
		});
	}
	return lines;
});

/**
 * The block's code: hidden runs of lines go between `// ---cut-start---`
 * and `// ---cut-end---`, the first one with the block's `// @filename`. A
 * shown `// @ts-expect-error -- 2345` becomes Twoslash's `// @errors: 2345`,
 * so the block shows the error that `tsc` expects.
 */
function twoslashCode(lines: ReadonlyArray<Line>, filename: string) {
	const errors: Array<string> = [];
	const kept = lines.filter((line) => {
		const error = line.shown ? expectedError.exec(line.text) : null;
		if (error?.[1]) {
			errors.push(error[1]);
		}
		return !error;
	});
	const shown = dedent(kept.filter((line) => line.shown).map((l) => l.text));
	const code: Array<string> = [];
	let hidden: Array<string> = [
		`// @filename: ${filename}`,
		...(errors.length ? [`// @errors: ${errors.join(" ")}`] : []),
	];
	const flush = () => {
		if (hidden.some((text) => text.trim())) {
			code.push("// ---cut-start---", ...hidden, "// ---cut-end---");
		}
		hidden = [];
	};
	for (const line of kept) {
		if (line.shown) {
			flush();
			code.push(shown.shift() ?? "");
		} else {
			hidden.push(line.text);
		}
	}
	flush();
	return code.join("\n");
}

/**
 * A `sample` fence includes the `// #region name` … `// #endregion` part of
 * a TypeScript file of a sample app as a `twoslash` block (the whole file
 * without `#name`):
 *
 * ````md
 * ```sample title="src/routes/todos.tsx"
 * tanstack-start/src/routes/todos.tsx#loader
 * ```
 * ````
 *
 * The rest of the file is still compiled, hidden, in the file's folder, so
 * its imports resolve like they do in the editor, and the block compiles in
 * that app's project. Its title is the file's path inside the app, unless
 * the file is in `src/docs/` or `app/docs/` (a page's own samples, not a
 * file of the app) or the fence sets `title="…"` (`title=""` for none).
 *
 * A `.vue` or `.svelte` file becomes a plain block of its region, marked with
 * `// #region name` in its script or `<!-- #region name -->` in its markup.
 * The sample app's own checker (`vue-tsc`, `svelte-check`) compiles it.
 */
export const expandSnippets = Effect.fn("expandSnippets")(function* (
	markdown: string,
	options: {
		/** The page's `.md` file. */
		readonly file: string;
		/** The dir of the sample apps. */
		readonly samplesDir: string;
	},
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const toPosix = (file: string) => file.split(path.sep).join("/");
	const apps = yield* sampleApps(options.samplesDir);
	const files: Array<string> = [];
	const parts: Array<string> = [];
	let end = 0;
	for (const match of markdown.matchAll(sampleFence)) {
		const [fence, meta = "", relative = "", region] = match;
		const file = path.join(options.samplesDir, relative.trim());
		const lang = path.extname(file).slice(1);
		if (lang !== "ts" && lang !== "tsx" && !componentLangs.has(lang)) {
			return yield* new ContentError({
				message: `${options.file}: a sample is a .ts, .tsx, .vue or .svelte file, not ${relative}`,
			});
		}
		const app = appOf(path, file, apps);
		if (!app) {
			return yield* new ContentError({
				message: `${options.file}: ${relative} isn't in a sample app (a folder of samples/ with a tsconfig.json)`,
			});
		}
		files.push(file);
		const lines = yield* markRegion(
			yield* fs.readFileString(file),
			region,
			file,
		);
		const inApp = toPosix(path.relative(app, file));
		const title =
			/\btitle="([^"]*)"/.exec(meta)?.[1] ??
			(/^(?:src|app)\/docs\//.test(inApp) ? "" : inApp);
		const titleMeta = title ? ` title="${title}"` : "";
		if (componentLangs.has(lang)) {
			const shown = dedent(
				lines.filter((line) => line.shown).map((line) => line.text),
			);
			parts.push(
				markdown.slice(end, match.index),
				`\`\`\`${lang}${titleMeta}\n${shown.join("\n")}\n\`\`\``,
			);
			end = match.index + fence.length;
			continue;
		}
		// Twoslash empties a block's files once it's done, so the block gets a
		// name of its own next to the file: other blocks importing the file
		// still read it from disk.
		const virtualPath = toPosix(
			path.relative(
				options.samplesDir,
				`${file.slice(0, -lang.length - 1)}.${region ?? "file"}.twoslash.${lang}`,
			),
		);
		parts.push(
			markdown.slice(end, match.index),
			`\`\`\`${lang} twoslash${titleMeta}\n${twoslashCode(lines, virtualPath)}\n\`\`\``,
		);
		end = match.index + fence.length;
	}
	parts.push(markdown.slice(end));
	return { files, markdown: parts.join("") } satisfies ExpandedSnippets;
});
