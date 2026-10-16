import { type ReleaseType, releaseTypes } from "./types.ts";

interface ValidPrTitle {
	readonly breaking: boolean;
	readonly scope: string | undefined;
	readonly subject: string;
	readonly type: ReleaseType;
}

export type PrTitleResult =
	| { readonly ok: true; readonly parsed: ValidPrTitle }
	| { readonly ok: false; readonly reason: string };

const typeAlternation = releaseTypes.join("|");

/** `type(scope)!: subject` — scope and `!` optional; subject is the rest. */
const pattern = new RegExp(
	`^(${typeAlternation})(?:\\(([a-z0-9][a-z0-9./-]*)\\))?(!)?: (.+)$`,
);

function isReleaseType(value: string): value is ReleaseType {
	for (const type of releaseTypes) {
		if (type === value) {
			return true;
		}
	}
	return false;
}

/**
 * Whether a pull request title is a conventional commit subject that
 * release-it will accept when the PR is squash-merged into main.
 */
export function validatePrTitle(title: string): PrTitleResult {
	const trimmed = title.trim();
	if (trimmed.length === 0) {
		return { ok: false, reason: "title is empty" };
	}
	if (trimmed !== title) {
		return {
			ok: false,
			reason: "title has leading or trailing whitespace",
		};
	}
	if (trimmed.endsWith(".")) {
		return {
			ok: false,
			reason: "title must not end with a period",
		};
	}

	const match = pattern.exec(trimmed);
	if (match === null) {
		return {
			ok: false,
			reason: `must match conventional commits: type(scope)!: subject (types: ${releaseTypes.join(", ")})`,
		};
	}

	const typeText = match[1] ?? "";
	if (!isReleaseType(typeText)) {
		return {
			ok: false,
			reason: `unknown type ${JSON.stringify(typeText)}`,
		};
	}
	const scope = match[2];
	const breaking = match[3] === "!";
	const subject = match[4] ?? "";
	if (subject.trim().length === 0) {
		return { ok: false, reason: "subject is empty" };
	}

	return {
		ok: true,
		parsed: { breaking, scope, subject, type: typeText },
	};
}

export function formatError(title: string, reason: string): string {
	return [
		`Invalid pull request title: ${JSON.stringify(title)}`,
		reason,
		"",
		"Examples:",
		"  feat: add infinite query helpers",
		"  fix(core)!: fetch waits for stale data",
		"  docs(testing): render in an async act",
		"  ci: skip a release when main moved before publishing",
		"",
		"Squash-merge uses the PR title as the commit message that release-it",
		"reads for the changelog and version bump. See CONTRIBUTING.md.",
	].join("\n");
}
