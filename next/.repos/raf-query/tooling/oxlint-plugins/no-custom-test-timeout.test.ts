import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-custom-test-timeout", plugin.rules["no-custom-test-timeout"], {
	valid: [
		`import { test, vi } from "vitest";
     test("fast", async () => {
       await vi.waitFor(() => {
         expect(true).toBe(true);
       });
     });`,
		`import { test } from "vitest";
     test("named", async () => {});`,
		`import { test } from "vitest";
     test.skip("skipped", async () => {});`,
		`import { describe, it } from "vitest";
     describe("suite", () => {
       it("case", () => {});
     });`,
		`setTimeout(() => {}, 5000);`,
		`vi.advanceTimersByTime(1500);`,
		`export default defineConfig({ test: { name: "web", environment: "jsdom" } });`,
		`await expect.poll(() => true).toBe(true);`,
	],
	invalid: [
		{
			code: `import { test } from "vitest";
             test("slow", { timeout: 20_000 }, async () => {});`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { test } from "vitest";
             test("slow", async () => {}, 20_000);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { it } from "vitest";
             it.skip("slow", async () => {}, 5000);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { describe } from "vitest";
             describe("suite", { timeout: 10_000 }, () => {});`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { test } from "vitest";
             test.extend({ timeout: 15_000 });`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { vi } from "vitest";
             await vi.waitFor(() => {}, { timeout: 5000 });`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `await waitFor(() => {}, { timeout: 3000, interval: 50 });`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `await expect.poll(() => true, { timeout: 4000 }).toBe(true);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `export default defineConfig({ test: { testTimeout: 10_000 } });`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `export default defineConfig({ test: { hookTimeout: 10_000, teardownTimeout: 20_000 } });`,
			errors: [{ messageId: "banned" }, { messageId: "banned" }],
		},
		{
			code: `vi.setConfig({ testTimeout: 30_000 });`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `test["skip"]("slow", async () => {}, 5000);`,
			errors: [{ messageId: "banned" }],
		},
	],
});
