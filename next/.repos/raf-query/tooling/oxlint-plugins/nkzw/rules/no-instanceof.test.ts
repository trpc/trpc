import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noInstanceofRule } from "./no-instanceof.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();

tester.run("no-instanceof", noInstanceofRule, {
	valid: [
		`if (value instanceof Error) {}`,
		`if (value instanceof CustomError) {}`,
		`if (value instanceof Exception) {}`,
		`if (value instanceof CustomException) {}`,
	],
	invalid: [
		{
			code: `if (value instanceof CustomClass) {}`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `if (value instanceof Promise) {}`,
			errors: [{ messageId: "banned" }],
		},
	],
});
