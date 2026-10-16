/**
 * Commit types release-it accepts (`effect: "bump"` or `"changelog"`). Keep in
 * sync with `.release-it.json` → `plugins["@release-it/conventional-changelog"].preset.types`.
 */
export const releaseTypes = [
	"feat",
	"fix",
	"perf",
	"build",
	"chore",
	"ci",
	"docs",
	"refactor",
	"style",
	"test",
] as const;

export type ReleaseType = (typeof releaseTypes)[number];
