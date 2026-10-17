import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import { expandSnippets } from "./snippets.ts";

/** Writes `files` to a temporary samples dir, removed when the test ends. */
const setup = Effect.fn("setup")(function* (files: Record<string, string>) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = yield* fs.makeTempDirectoryScoped({ prefix: "snippets-" });
	for (const [name, contents] of Object.entries(files)) {
		yield* fs.makeDirectory(path.dirname(path.join(root, name)), {
			recursive: true,
		});
		yield* fs.writeFileString(path.join(root, name), contents);
	}
	return {
		expand: (markdown: string) =>
			expandSnippets(markdown, {
				file: path.join(root, "page.md"),
				samplesDir: root,
			}),
		path,
		root,
	};
});

function sample(path: string, meta = "") {
	return `\`\`\`sample${meta}\n${path}\n\`\`\``;
}

function app(dir: string) {
	return { [`${dir}/tsconfig.json`]: "{}" };
}

const todos = [
	'import { todosQuery } from "../queries.ts";',
	"",
	"// #region loader",
	"export const Route = 1;",
	"// ^?",
	"// #endregion",
	"",
	"export function Page() {",
	"\t// #region body",
	"\treturn Route;",
	"\t// #endregion body",
	"}",
	"",
].join("\n");

describe("expandSnippets", () => {
	it.effect(
		"shows the region and compiles the rest of the file next to it",
		() =>
			Effect.gen(function* () {
				const page = yield* setup({
					"page/src/routes/todos.tsx": todos,
					...app("page"),
				});
				const expanded = yield* page.expand(
					`Intro\n\n${sample("page/src/routes/todos.tsx#loader")}\n\nOutro\n`,
				);
				expect(expanded.files).toEqual([
					page.path.join(page.root, "page/src/routes/todos.tsx"),
				]);
				expect(expanded.markdown).toBe(
					[
						"Intro",
						"",
						'```tsx twoslash title="src/routes/todos.tsx"',
						"// ---cut-start---",
						"// @filename: page/src/routes/todos.loader.twoslash.tsx",
						'import { todosQuery } from "../queries.ts";',
						"",
						"// ---cut-end---",
						"export const Route = 1;",
						"// ^?",
						"// ---cut-start---",
						"",
						"export function Page() {",
						"\treturn Route;",
						"}",
						"// ---cut-end---",
						"```",
						"",
						"Outro",
						"",
					].join("\n"),
				);
			}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("dedents a region and drops other regions' queries", () =>
		Effect.gen(function* () {
			const page = yield* setup({
				"page/src/routes/todos.tsx": todos,
				...app("page"),
			});
			const expanded = yield* page.expand(
				sample("page/src/routes/todos.tsx#body", ' title=""'),
			);
			expect(expanded.markdown).toBe(
				[
					"```tsx twoslash",
					"// ---cut-start---",
					"// @filename: page/src/routes/todos.body.twoslash.tsx",
					'import { todosQuery } from "../queries.ts";',
					"",
					"export const Route = 1;",
					"",
					"export function Page() {",
					"// ---cut-end---",
					"return Route;",
					"// ---cut-start---",
					"}",
					"// ---cut-end---",
					"```",
				].join("\n"),
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("includes a whole file, with a custom title", () =>
		Effect.gen(function* () {
			const page = yield* setup({
				"shared/client.ts": "export const a = 1;\n",
				...app("shared"),
			});
			const expanded = yield* page.expand(
				sample("shared/client.ts", ' title="src/client.ts"'),
			);
			expect(expanded.markdown).toBe(
				[
					'```ts twoslash title="src/client.ts"',
					"// ---cut-start---",
					"// @filename: shared/client.file.twoslash.ts",
					"// ---cut-end---",
					"export const a = 1;",
					"```",
				].join("\n"),
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("shows every part of a region that appears more than once", () =>
		Effect.gen(function* () {
			const page = yield* setup({
				...app("page"),
				"page/a.ts": [
					"// #region use",
					'import { a } from "./b.ts";',
					"// #endregion",
					'import { c } from "./c.ts";',
					"",
					"// #region use",
					"a(c);",
					"// #endregion use",
				].join("\n"),
			});
			const expanded = yield* page.expand(sample("page/a.ts#use"));
			expect(expanded.markdown).toBe(
				[
					'```ts twoslash title="a.ts"',
					"// ---cut-start---",
					"// @filename: page/a.use.twoslash.ts",
					"// ---cut-end---",
					'import { a } from "./b.ts";',
					"// ---cut-start---",
					'import { c } from "./c.ts";',
					"",
					"// ---cut-end---",
					"a(c);",
					"```",
				].join("\n"),
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("fails on a missing or unclosed region", () =>
		Effect.gen(function* () {
			const page = yield* setup({
				...app("page"),
				"page/a.ts": "// #region open\nexport const a = 1;\n",
			});
			const missing = yield* Effect.flip(
				page.expand(sample("page/a.ts#missing")),
			);
			expect(missing.message).toContain('no "// #region missing"');
			const open = yield* Effect.flip(page.expand(sample("page/a.ts#open")));
			expect(open.message).toContain("isn't closed");
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("shows a region of a component file without Twoslash", () =>
		Effect.gen(function* () {
			const page = yield* setup({
				...app("page"),
				"page/src/Post.vue": [
					'<script setup lang="ts">',
					"// #region script",
					"const post = usePost();",
					"// #endregion",
					"</script>",
					"",
					"<template>",
					"\t<!-- #region template -->",
					"\t<h1>{{ post.title }}</h1>",
					"\t<!-- #endregion template -->",
					"</template>",
				].join("\n"),
			});
			const script = yield* page.expand(sample("page/src/Post.vue#script"));
			expect(script.markdown).toBe(
				['```vue title="src/Post.vue"', "const post = usePost();", "```"].join(
					"\n",
				),
			);
			const template = yield* page.expand(
				sample("page/src/Post.vue#template", ' title=""'),
			);
			expect(template.markdown).toBe(
				["```vue", "<h1>{{ post.title }}</h1>", "```"].join("\n"),
			);
			const whole = yield* page.expand(sample("page/src/Post.vue"));
			expect(whole.markdown).not.toContain("#region");
			expect(whole.markdown).toContain("<template>\n\t<h1>");
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("fails on a file outside a sample app", () =>
		Effect.gen(function* () {
			const page = yield* setup({ "page/a.ts": "export const a = 1;\n" });
			const error = yield* Effect.flip(page.expand(sample("page/a.ts")));
			expect(error.message).toContain("isn't in a sample app");
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("includes a Next.js path that contains [param]", () =>
		Effect.gen(function* () {
			const page = yield* setup({
				...app("page"),
				"page/src/app/posts/[slug]/page.tsx":
					"export default function Page() {}\n",
			});
			const expanded = yield* page.expand(
				sample("page/src/app/posts/[slug]/page.tsx"),
			);
			expect(expanded.markdown).toContain(
				'```tsx twoslash title="src/app/posts/[slug]/page.tsx"',
			);
			expect(expanded.markdown).toContain(
				"// @filename: page/src/app/posts/[slug]/page.file.twoslash.tsx",
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("gives a page's own samples no title", () =>
		Effect.gen(function* () {
			const page = yield* setup({
				...app("page"),
				"page/src/docs/retries.ts": "export const a = 1;\n",
			});
			const expanded = yield* page.expand(sample("page/src/docs/retries.ts"));
			expect(expanded.markdown).toContain("```ts twoslash\n");
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("gives no title to a page's own samples in an app/ app", () =>
		Effect.gen(function* () {
			const page = yield* setup({
				...app("page"),
				"page/app/docs/react-router.ts": "export const a = 1;\n",
			});
			const expanded = yield* page.expand(
				sample("page/app/docs/react-router.ts"),
			);
			expect(expanded.markdown).toContain("```ts twoslash\n");
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("shows an expected error as Twoslash's @errors", () =>
		Effect.gen(function* () {
			const page = yield* setup({
				...app("page"),
				"page/a.ts": [
					"declare function f(input: { a: number }): void;",
					"// #region call",
					"// @ts-expect-error -- 2345: the input is an object",
					"f(1);",
					"// #endregion",
				].join("\n"),
			});
			const expanded = yield* page.expand(sample("page/a.ts#call"));
			expect(expanded.markdown).toBe(
				[
					'```ts twoslash title="a.ts"',
					"// ---cut-start---",
					"// @filename: page/a.call.twoslash.ts",
					"// @errors: 2345",
					"declare function f(input: { a: number }): void;",
					"// ---cut-end---",
					"f(1);",
					"```",
				].join("\n"),
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});
