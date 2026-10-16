import type { Element, ElementContent, Properties } from "hast";
import { toString } from "hast-util-to-string";
import type { ShikiTransformer } from "shiki";

/**
 * Folds lines between `// ---collapse---` and `// ---/collapse---` behind
 * “N collapsed lines”. `DocBody` opens and closes the region.
 *
 * The markers are comments, so Twoslash still typechecks the lines. This runs
 * after Twoslash, and the folded range keeps the type and error rows of those
 * lines. `// ---cut---` deletes lines instead, so they can't be opened.
 *
 * Astro's docs do this with Expressive Code, which also highlights with Shiki.
 * That plugin doesn't run Twoslash, so the fold lives in the highlighter this
 * site already uses.
 *
 * A tab counts as two columns, matching `tab-size: 2` on `.code-block pre`.
 */

const collapseStart = /^[ \t]*\/\/ ---collapse---[ \t]*$/;
const collapseEnd = /^[ \t]*\/\/ ---\/collapse---[ \t]*$/;

/** Drops collapse markers. The lines between them stay, for agents' markdown. */
export function stripCollapseMarkers(code: string) {
	return code
		.split("\n")
		.filter((line) => !collapseStart.test(line) && !collapseEnd.test(line))
		.join("\n");
}

function classNames(node: Element) {
	const value = node.properties.class ?? node.properties.className;
	if (Array.isArray(value)) {
		return value.map(String);
	}
	if (value == null || value === false) {
		return [];
	}
	return String(value).split(/\s+/);
}

function hasClass(node: ElementContent, name: string): node is Element {
	return node.type === "element" && classNames(node).includes(name);
}

function isNewline(node: ElementContent) {
	return node.type === "text" && node.value === "\n";
}

/** Columns of leading whitespace. A tab is two columns (`tab-size: 2`). */
function indentColumns(text: string) {
	let columns = 0;
	for (const char of text) {
		if (char === " ") {
			columns += 1;
		} else if (char === "\t") {
			columns += 2;
		} else {
			break;
		}
	}
	return columns;
}

interface Region {
	readonly end: number;
	readonly start: number;
}

function regionsOf(lines: ReadonlyArray<Element>) {
	const regions: Array<Region> = [];
	let start: number | undefined;
	for (const [index, line] of lines.entries()) {
		const text = toString(line);
		if (collapseStart.test(text)) {
			if (start !== undefined) {
				throw new Error(
					"Nested // ---collapse---. Close the open region before starting another.",
				);
			}
			start = index;
		} else if (collapseEnd.test(text)) {
			if (start === undefined) {
				throw new Error(
					"A // ---/collapse--- has no // ---collapse--- before it.",
				);
			}
			if (index - start < 2) {
				throw new Error("A // ---collapse--- region is empty.");
			}
			regions.push({ end: index, start });
			start = undefined;
		}
	}
	if (start !== undefined) {
		throw new Error("A // ---collapse--- has no // ---/collapse--- after it.");
	}
	return regions;
}

function childIndex(
	children: ReadonlyArray<ElementContent>,
	line: Element | undefined,
) {
	const index = line === undefined ? -1 : children.indexOf(line);
	if (index < 0) {
		throw new Error("A collapsed line is missing from the highlighted code.");
	}
	return index;
}

/** The highlighted rows between the marker lines, markers excluded. */
function regionNodes(
	children: ReadonlyArray<ElementContent>,
	startAt: number,
	endAt: number,
) {
	let inner = children.slice(startAt + 1, endAt);
	if (inner[0] && isNewline(inner[0])) {
		inner = inner.slice(1);
	}
	const last = inner.at(-1);
	if (last && isNewline(last)) {
		inner = inner.slice(0, -1);
	}
	return inner;
}

function rowCount(nodes: ReadonlyArray<ElementContent>) {
	return nodes.filter(
		(node) => hasClass(node, "line") || hasClass(node, "twoslash-meta-line"),
	).length;
}

function regionIndent(nodes: ReadonlyArray<ElementContent>) {
	let indent: number | undefined;
	for (const node of nodes) {
		if (!hasClass(node, "line")) {
			continue;
		}
		const text = toString(node);
		if (text.trim() === "") {
			continue;
		}
		const columns = indentColumns(text);
		if (indent === undefined || columns < indent) {
			indent = columns;
		}
	}
	return indent ?? 0;
}

function lineWord(count: number) {
	return count === 1 ? "line" : "lines";
}

function collapseToggle(count: number, id: string, indent: number): Element {
	const lines = lineWord(count);
	const properties: Properties = {
		ariaControls: [id],
		ariaExpanded: "false",
		className: ["code-collapse-toggle"],
		dataCollapse: "",
		type: "button",
	};
	if (indent > 0) {
		properties.style = `--collapse-indent: ${indent}`;
	}
	return {
		children: [
			{
				children: [],
				properties: {
					ariaHidden: "true",
					className: ["code-collapse-chevron"],
				},
				tagName: "span",
				type: "element",
			},
			{
				children: [{ type: "text", value: `${count} collapsed ${lines}` }],
				properties: { className: ["code-collapse-when-closed"] },
				tagName: "span",
				type: "element",
			},
			{
				children: [{ type: "text", value: `Hide ${count} ${lines}` }],
				properties: { className: ["code-collapse-when-open"], hidden: true },
				tagName: "span",
				type: "element",
			},
		],
		properties,
		tagName: "button",
		type: "element",
	};
}

function collapseElement(inner: Array<ElementContent>, id: string): Element {
	return {
		children: [
			collapseToggle(rowCount(inner), id, regionIndent(inner)),
			{
				children: inner,
				properties: { className: ["code-collapse-body"], hidden: true, id },
				tagName: "span",
				type: "element",
			},
		],
		properties: { className: ["code-collapse"] },
		tagName: "span",
		type: "element",
	};
}

export function collapseRegions(nextId: () => string): ShikiTransformer {
	return {
		code(code) {
			const regions = regionsOf(this.lines);
			// Indexes are taken before any splice. Later regions are replaced
			// first, so the earlier indexes stay put. Ids follow source order.
			const built = regions.map((region) => {
				const startAt = childIndex(code.children, this.lines[region.start]);
				let endAt = childIndex(code.children, this.lines[region.end]);
				const inner = regionNodes(code.children, startAt, endAt);
				// The wrapper is a block, so a newline after it would render as an
				// empty line. It ends the body instead, where it renders as nothing
				// and Copy still puts the next line on a line of its own.
				const after = code.children[endAt + 1];
				if (after && isNewline(after)) {
					inner.push(after);
					endAt += 1;
				}
				return {
					endAt,
					startAt,
					wrapper: collapseElement(inner, nextId()),
				};
			});
			for (const region of built.toReversed()) {
				code.children.splice(
					region.startAt,
					region.endAt - region.startAt + 1,
					region.wrapper,
				);
			}
		},
		name: "raf-query-docs:collapse",
	};
}
