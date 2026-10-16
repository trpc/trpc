import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noUnknownReturnsRule } from "./no-unknown-returns.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});
const error = { messageId: "unknownReturn" };

tester.run("no-unknown-returns", noUnknownReturnsRule, {
	valid: [
		"type ImportedValue = unknown;",
		"function parse(): ImportedValue { return input; }",
		"function parse(): User { return user; }",
		"function infer() { return input; }",
		"function generic<Value>(): Value { return value; }",
		"type Value = unknown; function generic<Value>(): Value { return value; }",
		"type Key = unknown; type Mapped<Input> = { [Key in keyof Input]: () => Key };",
		"type Item = unknown; type Unpacked<Input> = Input extends Promise<infer Item> ? () => Item : never;",
		"function cause(): { cause: unknown } { return { cause: input }; }",
		"type Result = { value: unknown }; function load(): Result { return result; }",
		"function load(): Promise<User> { return promise; }",
	],
	invalid: [
		{ code: "function load(): unknown { return input; }", errors: [error] },
		{ code: "const load = (): unknown => input;", errors: [error] },
		{ code: "type Loader = () => unknown;", errors: [error] },
		{ code: "interface Loader { load(): unknown }", errors: [error] },
		{ code: "declare function load(): unknown;", errors: [error] },
		{
			code: "function load(): string | unknown { return input; }",
			errors: [error],
		},
		{
			code: "function load(): Promise<unknown> { return promise; }",
			errors: [error],
		},
		{
			code: "type UnknownValue = unknown; function load(): UnknownValue { return input; }",
			errors: [error],
		},
		{
			code: "type Item = unknown; type Fallback<Input> = Input extends infer Item ? string : () => Item;",
			errors: [error],
		},
	],
});
