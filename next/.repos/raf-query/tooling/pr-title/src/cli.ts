#!/usr/bin/env node
import { formatError, validatePrTitle } from "./validate.ts";

const title = process.env["PR_TITLE"] ?? process.argv[2];
if (title === undefined || title.length === 0) {
	console.error(
		"Usage: PR_TITLE='feat: …' pnpm --filter @tooling/pr-title check\n" +
			"   or: pnpm --filter @tooling/pr-title check 'feat: …'",
	);
	process.exit(2);
}

const result = validatePrTitle(title);
if (!result.ok) {
	console.error(formatError(title, result.reason));
	process.exit(1);
}

const scope =
	result.parsed.scope === undefined ? "" : `(${result.parsed.scope})`;
const bang = result.parsed.breaking ? "!" : "";
console.log(
	`ok ${result.parsed.type}${scope}${bang}: ${result.parsed.subject}`,
);
