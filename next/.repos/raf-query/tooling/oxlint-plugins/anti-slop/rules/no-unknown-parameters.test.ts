import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noUnknownParametersRule } from "./no-unknown-parameters.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});

tester.run("no-unknown-parameters", noUnknownParametersRule, {
	valid: [
		"function enrich(cause: unknown): void {}",
		"function parse(value: string): void {}",
	],
	invalid: [
		{
			code: "function parse(value: unknown): void {}",
			errors: [{ messageId: "unknownParameter" }],
		},
	],
});
