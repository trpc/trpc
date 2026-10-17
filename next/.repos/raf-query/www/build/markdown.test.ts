import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import { renderMarkdown } from "./markdown.ts";

/** A samples dir whose `tanstack-start` app compiles inline blocks, removed when the test ends. */
const samples = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = yield* fs.makeTempDirectoryScoped({ prefix: "markdown-" });
	const app = path.join(root, "tanstack-start");
	yield* fs.makeDirectory(path.join(app, "src"), { recursive: true });
	yield* fs.writeFileString(path.join(app, "src/app.ts"), "export {};");
	yield* fs.writeFileString(
		path.join(app, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: { lib: ["es5"], strict: true, types: [] },
			include: ["src"],
		}),
	);
	return root;
});

describe("renderMarkdown", () => {
	it.effect("lists each block's type queries in page order", () =>
		Effect.gen(function* () {
			const samplesDir = yield* samples;
			// As in a build, an earlier page has made Shiki load `ts` already.
			yield* renderMarkdown("```ts\nconst a = 1;\n```", { samplesDir });
			const markdown = [
				"```tsx twoslash",
				"const first = 1;",
				"//    ^?",
				"```",
				"",
				"```json",
				'{ "a": 1 }',
				"```",
				"",
				"```ts twoslash",
				'const second = "b";',
				"//    ^?",
				"```",
			].join("\n");
			const rendered = yield* renderMarkdown(markdown, { samplesDir });
			expect(rendered.typeQueries).toEqual([
				["const first: 1"],
				['const second: "b"'],
			]);
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});
