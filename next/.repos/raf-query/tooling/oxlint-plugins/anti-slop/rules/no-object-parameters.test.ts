import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noObjectParametersRule } from "./no-object-parameters.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});
const error = { messageId: "objectParameter" };

tester.run("no-object-parameters", noObjectParametersRule, {
	valid: [
		"type Alias = object;",
		"function f(value: Alias) {}",
		"interface Owner { readonly id: string } function f(value: Owner) {}",
		"function f<Value>(value: Value) {}",
		"function f<Value extends object>(value: Value) {}",
		"function f<Value extends Owner, Owner extends { readonly id: string }>(value: Value) {}",
		"type Owner = { readonly id: string }; function f<Value extends Owner>(value: Value) {}",
		"type Alias = object; function consume<Alias>(value: Alias) {}",
		"type Alias = object; type Consumer<Alias> = (value: Alias) => void;",
		"type Alias = object; interface Consumer<Alias> { consume(value: Alias): void }",
		"type Key = object; type Mapped<Input> = { [Key in keyof Input]: (value: Key) => void };",
		"type Item = object; type Unpacked<Input> = Input extends Promise<infer Item> ? (value: Item) => void : never;",
	],
	invalid: [
		{ code: "function f(value: object) {}", errors: [error] },
		{
			code: "type Alias = object; function f(value: Alias) {}",
			errors: [error],
		},
		{
			code: "type Alias = (object); function f(value: Alias) {}",
			errors: [error],
		},
		{
			code: "type Item = object; type Fallback<Input> = Input extends infer Item ? string : (value: Item) => void;",
			errors: [error],
		},
	],
});
