import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("infer-callback-params", plugin.rules["infer-callback-params"], {
	valid: [
		`items.map((item) => item.id);`,
		`const button = <Button onClick={(event) => event.preventDefault()} />;`,
		`useMutation({
       mutationFn: async (value) => save(value),
     });`,
		`function parse(value: string) {
       return Number(value);
     }`,
		`const parse = (value: string) => Number(value);`,
		`const helpers = {
       parse: (value: string) => Number(value),
     };`,
		{
			filename: "src/routeTree.gen.ts",
			code: `items.map((item: Item) => item.id);`,
		},
	],
	invalid: [
		{
			code: `items.map((item: Item) => item.id);`,
			errors: [
				{
					messageId: "infer",
					suggestions: [
						{
							messageId: "inferSuggestion",
							output: `items.map((item) => item.id);`,
						},
					],
				},
			],
		},
		{
			code: `const button = <Button onClick={(event: MouseEvent) => event.preventDefault()} />;`,
			errors: [
				{
					messageId: "infer",
					suggestions: [
						{
							messageId: "inferSuggestion",
							output: `const button = <Button onClick={(event) => event.preventDefault()} />;`,
						},
					],
				},
			],
		},
		{
			code: `useMutation({
        mutationFn: async (value: Input) => save(value),
      });`,
			errors: [
				{
					messageId: "infer",
					suggestions: [
						{
							messageId: "inferSuggestion",
							output: `useMutation({
        mutationFn: async (value) => save(value),
      });`,
						},
					],
				},
			],
		},
		{
			code: `router.use({
        nested: {
          handler: function ({ request }: HandlerContext) {
            return request.url;
          },
        },
      });`,
			errors: [
				{
					messageId: "infer",
					suggestions: [
						{
							messageId: "inferSuggestion",
							output: `router.use({
        nested: {
          handler: function ({ request }) {
            return request.url;
          },
        },
      });`,
						},
					],
				},
			],
		},
		{
			code: `promise.catch((error: unknown) => report(error));`,
			errors: [
				{
					messageId: "infer",
					suggestions: [
						{
							messageId: "inferSuggestion",
							output: `promise.catch((error) => report(error));`,
						},
					],
				},
			],
		},
	],
});
