import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noForbiddenTermInSymbolNamesRule } from "./no-shape-in-symbol-names.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});

tester.run("no-shape-in-symbol-names", noForbiddenTermInSymbolNamesRule, {
	valid: ["interface UserRecord { id: string }"],
	invalid: [
		{
			code: "interface UserShape { id: string }",
			errors: [{ messageId: "forbiddenSymbolName" }],
		},
	],
});
