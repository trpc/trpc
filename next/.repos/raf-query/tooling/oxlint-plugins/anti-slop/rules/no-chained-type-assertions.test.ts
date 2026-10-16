import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noChainedTypeAssertionsRule } from "./no-chained-type-assertions.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});

tester.run("no-chained-type-assertions", noChainedTypeAssertionsRule, {
	valid: ["declare const value: string; const result = value as string;"],
	invalid: [
		{
			code: "declare const value: unknown; const result = value as object as { id: string };",
			errors: [{ messageId: "chained" }],
		},
	],
});
