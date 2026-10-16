import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noUnknownTypeAliasesRule } from "./no-unknown-type-aliases.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});
const error = { messageId: "unknownAlias" };

tester.run("no-unknown-type-aliases", noUnknownTypeAliasesRule, {
	valid: [
		"type User = { readonly id: string };",
		"type Alias = string; type UserId = Alias;",
	],
	invalid: [
		{ code: "type Alias = unknown;", errors: [error] },
		{ code: "type Current = unknown;", errors: [error] },
		{
			code: "type UnknownValue = unknown; type Alias = UnknownValue;",
			errors: [error, error],
		},
	],
});
