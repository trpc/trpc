import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "@effect/vitest";

import { releaseTypes } from "./types.ts";
import { formatError, validatePrTitle } from "./validate.ts";

const repoRoot = join(import.meta.dirname, "../../..");

describe("validatePrTitle", () => {
	it("matches the types and package paths in .release-it.json", () => {
		const releaseIt: {
			git: { commitsPath: string };
			plugins: {
				"@release-it/conventional-changelog": {
					commitsOpts: { path: string };
					gitRawCommitsOpts: { path: string };
					preset: {
						types: Array<{
							effect: "bump" | "changelog";
							section: string;
							type: string;
						}>;
					};
				};
			};
		} = JSON.parse(readFileSync(join(repoRoot, ".release-it.json"), "utf8"));
		const changelog = releaseIt.plugins["@release-it/conventional-changelog"];
		const types = changelog.preset.types;
		expect(releaseTypes.toSorted()).toEqual(
			types.map((entry) => entry.type).toSorted(),
		);
		// Same packages/* as the release gate (git.commitsPath).
		expect(changelog.commitsOpts.path).toBe("packages/*");
		expect(changelog.gitRawCommitsOpts.path).toBe("packages/*");
		expect(releaseIt.git.commitsPath).toBe("packages/*");
		// The path decides what's in the notes, so no type is hidden.
		// conventional-changelog v10+ reads effect, not the old hidden: true.
		expect(
			types
				.filter((entry) => entry.effect === "bump")
				.map((entry) => entry.type),
		).toEqual(["feat", "fix", "perf"]);
		for (const entry of types) {
			expect(entry.effect === "bump" || entry.effect === "changelog").toBe(
				true,
			);
			expect(entry.section).toBeTruthy();
			expect(Object.keys(entry).includes("hidden")).toBe(false);
		}
	});

	it.each([
		"feat: add infinite query helpers",
		"fix(core)!: fetch waits for stale data",
		"feat!: type options by a bag instead of positional type arguments",
		"docs(testing): render in an async act so suspended trees resume",
		"ci: skip a release when main moved before publishing",
		"feat(core): ssr: false runs a query in the browser only",
		"refactor(react): drop useIsFetching",
		"perf(core): share structural sharing work",
		"chore: release v0.6.1",
		"test(react): cover hydration races",
		"style: tidy demo layout",
		"build: bump vite",
		"ci(codesandbox): speed up the branch sync",
		"feat(examples): deploy the example apps",
		"docs: RSC apps hydrate only through HydrationBoundary",
	])("accepts %s", (title) => {
		const result = validatePrTitle(title);
		expect(result.ok).toBe(true);
	});

	it("parses type, scope, breaking and subject", () => {
		expect(validatePrTitle("fix(core)!: fetch waits for stale data")).toEqual({
			ok: true,
			parsed: {
				breaking: true,
				scope: "core",
				subject: "fetch waits for stale data",
				type: "fix",
			},
		});
	});

	it("marks feat! without a scope as breaking", () => {
		expect(validatePrTitle("feat!: remove useIsFetching")).toEqual({
			ok: true,
			parsed: {
				breaking: true,
				scope: undefined,
				subject: "remove useIsFetching",
				type: "feat",
			},
		});
	});

	it.each([
		["", "title is empty"],
		["   feat: padded   ", "title has leading or trailing whitespace"],
		["feat: ends with a period.", "title must not end with a period"],
		[
			"Remove useIsFetching; keep per-query isFetching",
			"must match conventional commits",
		],
		["wip: not a release type", "must match conventional commits"],
		["feat:", "must match conventional commits"],
		["feat(CORE): uppercase scope", "must match conventional commits"],
		["feat(): empty scope", "must match conventional commits"],
	])("rejects %j", (title, reasonPart) => {
		const result = validatePrTitle(title);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain(reasonPart);
		}
	});

	it("lists every release-it type in the error", () => {
		const result = validatePrTitle("nope");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			for (const type of releaseTypes) {
				expect(result.reason).toContain(type);
			}
		}
	});

	it("formatError points at CONTRIBUTING and examples", () => {
		const text = formatError("Nope", "must match conventional commits");
		expect(text).toContain("Invalid pull request title");
		expect(text).toContain("Nope");
		expect(text).toContain("fix(core)!:");
		expect(text).toContain("CONTRIBUTING.md");
	});
});
