import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { noManualMemoization } from "./no-manual-memoization.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-manual-memoization", noManualMemoization, {
	valid: [
		`import * as React from "react";
     React.useState(0);`,
		`import { useState } from "react";
     useState(0);`,
	],
	invalid: [
		{
			code: `import { useMemo } from "react";
             useMemo(() => 1, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { useMemo as memoize } from "react";
             memoize(() => 1, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import * as React from "react";
             React.useMemo(() => 1, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `react["useMemo"](() => 1, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `const { useMemo } = React;`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { useCallback } from "react";
             useCallback(() => 1, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { useCallback as stabilize } from "react";
             stabilize(() => 1, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import * as React from "react";
             React.useCallback(() => 1, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `react["useCallback"](() => 1, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `const { useCallback } = React;`,
			errors: [{ messageId: "banned" }],
		},
	],
});
