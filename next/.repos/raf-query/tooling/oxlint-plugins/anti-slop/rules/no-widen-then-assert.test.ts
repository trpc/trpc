import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noWidenThenAssertRule } from "./no-widen-then-assert.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});
const error = { messageId: "widenThenAssert" };

tester.run("no-widen-then-assert", noWidenThenAssertRule, {
	valid: [
		"const source = { id: 'first' }; const widened: unknown = source;",
		"declare const input: unknown; const parsed = input as { readonly id: string };",
	],
	invalid: [
		{
			code: "const source = { id: 'second' }; const widened: unknown = source; const parsed = widened as { readonly id: string };",
			errors: [error],
		},
	],
});
