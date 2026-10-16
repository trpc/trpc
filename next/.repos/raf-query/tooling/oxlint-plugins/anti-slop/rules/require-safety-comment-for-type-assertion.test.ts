import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { requireSafetyCommentForTypeAssertionRule } from "./require-safety-comment-for-type-assertion.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});
const error = { messageId: "missingSafetyComment" };

tester.run(
	"require-safety-comment-for-type-assertion",
	requireSafetyCommentForTypeAssertionRule,
	{
		valid: [
			"const values = [1, 2] as const;",
			"const value = <const>{ id: 'one' };",
			"// SAFETY: The parser established the UserId invariant.\nconst id = value as UserId;",
			"function parse(): UserId {\n// SAFETY: Validation above established the UserId invariant.\nreturn value as UserId;\n}",
			"const id = /* SAFETY: Validation established the invariant. */ value as UserId;",
			"declare const options: Options;\ndeclare const paged: boolean;\nconst infinite = paged\n? new Observer(\n// SAFETY: paged factories carry page params.\noptions as InfiniteOptions,\n)\n: undefined;",
			"declare const infinite: InfiniteObserver | QueryObserver;\nconst observer = infinite\n? // SAFETY: an infinite observer is a query observer.\n(infinite as QueryObserver)\n: infinite;",
			"// SAFETY: the chain is one cast.\nreturn value as unknown as UserId;",
		],
		invalid: [
			{ code: "const id = value as UserId;", errors: [error] },
			{ code: "const id = <UserId>value;", errors: [error] },
			{
				code: "const id = value as UserId; // SAFETY: Too late.",
				errors: [error],
			},
			{
				code: "// This cast seems fine.\nconst id = value as UserId;",
				errors: [error],
			},
			{
				code: "// SAFETY: paged factories carry page params.\ndeclare const options: Options;\ndeclare const paged: boolean;\nconst infinite = paged ? new Observer(options as InfiniteOptions) : undefined;",
				errors: [error],
			},
			{
				code: "// SAFETY: an infinite observer is a query observer.\ndeclare const infinite: InfiniteObserver | QueryObserver;\nconst observer = infinite ? (infinite as QueryObserver) : infinite;",
				errors: [error],
			},
		],
	},
);
