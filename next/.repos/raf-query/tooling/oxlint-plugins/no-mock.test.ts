import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-mock", plugin.rules["no-mock"], {
	valid: [
		`import { vi } from "vitest";
     const fn = vi.fn();
     fn();`,
		`import { vi } from "vitest";
     const spy = vi.spyOn(console, "log");
     spy.mockRestore();`,
		`import { expect } from "vitest";
     expect(true).toBe(true);`,
		// A local named `mock` that never came from the mocking API is fine.
		`import { vi } from "vitest";
     const { mock } = vi.fn();
     mock();`,
	],
	invalid: [
		{
			code: `import { vi } from "vitest";
             vi.mock("./mod", () => ({}));`,
			errors: [{ message: /banned: vi\.mock/ }],
		},
		{
			code: `import { vi } from "vitest";
             vi.hoisted(() => ({ x: 1 }));`,
			errors: [{ message: /banned: vi\.hoisted/ }],
		},
		{
			code: `import { vi } from "vitest";
             vi.doMock("./mod");`,
			errors: [{ message: /banned: vi\.doMock/ }],
		},
		{
			code: `import { vi } from "vitest";
             vi["mock"]("./mod", () => ({}));`,
			errors: [{ message: /banned: vi\.mock/ }],
		},
		{
			code: `import { jest } from "@jest/globals";
             jest.mock("./mod");`,
			errors: [{ message: /banned: jest\.mock/ }],
		},
		{
			code: `import { vi as v } from "vitest";
             v.mock("./mod", () => ({}));`,
			errors: [{ message: /banned: v\.mock/ }],
		},
		{
			code: `import * as vitest from "vitest";
             vitest.mock("./mod", () => ({}));`,
			errors: [{ message: /banned: vitest\.mock/ }],
		},
		{
			code: `import { vi } from "vitest";
             const { mock, hoisted } = vi;
             hoisted(() => ({}));
             mock("./mod");`,
			errors: [
				{ message: /banned: vi\.mock/ },
				{ message: /banned: vi\.hoisted/ },
			],
		},
	],
});
