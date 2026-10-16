import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Element, ElementContent, Root } from "hast";
import { toString } from "hast-util-to-string";
import { codeToHast } from "shiki";

import { collapseRegions } from "./collapse.ts";

const highlight = (code: string) =>
	Effect.promise(() =>
		codeToHast(code, {
			lang: "ts",
			theme: "github-light",
			transformers: [collapseRegions(() => "fold")],
		}),
	);

function firstElement(node: Root | Element) {
	const child = node.children[0];
	if (child?.type !== "element") {
		throw new Error("Expected an element.");
	}
	return child;
}

function codeElement(root: Root) {
	return firstElement(firstElement(root));
}

function isFold(node: ElementContent | undefined): node is Element {
	return (
		node?.type === "element" &&
		String(node.properties.className) === "code-collapse"
	);
}

/** What Copy puts on the clipboard: the code without the fold's label. */
function copyText(code: Element) {
	return code.children
		.map((child) =>
			isFold(child)
				? child.children.slice(1).map(toString).join("")
				: toString(child),
		)
		.join("");
}

describe("collapseRegions", () => {
	it.effect("folds lines in the middle without an empty line after", () =>
		Effect.gen(function* () {
			const code = codeElement(
				yield* highlight(
					[
						"const a = 1;",
						"// ---collapse---",
						"const b = 2;",
						"const c = 3;",
						"// ---/collapse---",
						"const d = 4;",
					].join("\n"),
				),
			);
			const at = code.children.findIndex(isFold);
			expect(code.children.slice(at + 1, at + 2).map(toString)).toEqual([
				"const d = 4;",
			]);
			expect(copyText(code)).toBe(
				["const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;"].join(
					"\n",
				),
			);
		}),
	);

	it.effect("folds lines at the end", () =>
		Effect.gen(function* () {
			const code = codeElement(
				yield* highlight(
					[
						"const a = 1;",
						"// ---collapse---",
						"const b = 2;",
						"// ---/collapse---",
					].join("\n"),
				),
			);
			expect(isFold(code.children.at(-1))).toBe(true);
			expect(copyText(code)).toBe("const a = 1;\nconst b = 2;");
		}),
	);
});
