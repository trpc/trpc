import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSync } from "oxc-parser";

/**
 * Oxlint doesn't read Markdown, so a rule's test passes this as `valid` to
 * hold every JS/TS fence in the repo's Markdown to that rule. `sample` fences
 * aren't here: they include files from `www/samples`, which oxlint lints.
 *
 * A fence that is only an object's members (a route's `loader: …,`) is linted
 * inside `({ … })`. One that doesn't parse either way fails its test.
 */

const root = path.resolve(import.meta.dirname, "../..");

const extensionOf = new Map([
	["cjs", "js"],
	["cts", "ts"],
	["javascript", "js"],
	["js", "js"],
	["jsx", "jsx"],
	["mjs", "js"],
	["mts", "ts"],
	["ts", "ts"],
	["tsx", "tsx"],
	["typescript", "ts"],
]);

const openingFence = /^([ \t]*)(`{3,}|~{3,})[ \t]*([\w-]*)/;

interface Fence {
	readonly code: string;
	readonly filename: string;
	readonly name: string;
}

function markdownFiles() {
	const output = execFileSync(
		"git",
		["ls-files", "-z", "--", "*.md", "*.mdx"],
		{ cwd: root, encoding: "utf8" },
	);
	return (
		output
			.split("\0")
			.filter(Boolean)
			// `.repos` is vendored source. `CHANGELOG.md` is generated from commit
			// messages, so its snippets are history.
			.filter((file) => !file.startsWith(".repos/") && file !== "CHANGELOG.md")
	);
}

function parses(filename: string, code: string) {
	return parseSync(filename, code).errors.length === 0;
}

function lintable(filename: string, code: string) {
	const members = `({\n${code}\n});`;
	return !parses(filename, code) && parses(filename, members) ? members : code;
}

function fencesIn(file: string) {
	const lines = readFileSync(path.join(root, file), "utf8").split("\n");
	const fences: Array<Fence> = [];
	for (let index = 0; index < lines.length; index++) {
		const opening = openingFence.exec(lines[index] ?? "");
		if (!opening) {
			continue;
		}
		const [, indent = "", marker = "", lang = ""] = opening;
		const closing = new RegExp(
			`^[ \\t]*${marker[0]}{${marker.length},}[ \\t]*$`,
		);
		const start = index + 1;
		let end = start;
		while (end < lines.length && !closing.test(lines[end] ?? "")) {
			end++;
		}
		const extension = extensionOf.get(lang.toLowerCase());
		if (extension) {
			const code = lines
				.slice(start, end)
				.map((line) =>
					line.startsWith(indent) ? line.slice(indent.length) : line,
				)
				.join("\n");
			const filename = path.join(root, `${file}.${start}.${extension}`);
			fences.push({
				code: lintable(filename, code),
				filename,
				name: `${file}:${start}`,
			});
		}
		index = end;
	}
	return fences;
}

export function markdownFences() {
	return markdownFiles().flatMap(fencesIn);
}
