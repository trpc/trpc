import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-use-effect", plugin.rules["no-use-effect"], {
	valid: [
		`import { useMemo, useRef } from "react";`,
		`function useEffect() { return "a local function"; } useEffect();`,
		`import * as React from "react"; React.useMemo(() => 1, []);`,
	],
	invalid: [
		{
			code: `import { useEffect } from "react";`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { useEffect as runAfterRender } from "react";`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import React from "react"; React.useEffect(() => {}, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import * as React from "react"; React.useEffect(() => {}, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import * as React from "react"; React["useEffect"](() => {}, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import * as React from "react"; const { useEffect } = React;`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `export { useEffect } from "react";`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import { useLayoutEffect } from "react";`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import React from "react"; React.useLayoutEffect(() => {}, []);`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `import * as React from "react"; const { useLayoutEffect } = React;`,
			errors: [{ messageId: "banned" }],
		},
		{
			code: `export { useLayoutEffect } from "react";`,
			errors: [{ messageId: "banned" }],
		},
	],
});
