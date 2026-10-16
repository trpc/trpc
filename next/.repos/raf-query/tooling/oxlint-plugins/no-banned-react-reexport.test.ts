import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run(
	"no-banned-react-reexport",
	plugin.rules["no-banned-react-reexport"],
	{
		valid: [
			`export { useRef, useTransition } from "react";`,
			`export { Button } from "@examples/ui/components/button";`,
			`import { useEffect } from "react"; export function useThing() { useEffect(() => {}, []); }`,
			`import { useRef } from "react"; export { useRef };`,
			`export { useOptimistic, useState } from "react";`,
		],
		invalid: [
			{
				code: `export { useEffect } from "react";`,
				errors: [{ messageId: "banned" }],
			},
			{
				code: `export { useMemo } from "react";`,
				errors: [{ messageId: "banned" }],
			},
			{
				code: `export { useCallback, useMemo } from "react";`,
				errors: [{ messageId: "banned" }, { messageId: "banned" }],
			},
			{
				code: `export { useLayoutEffect as afterPaint } from "react";`,
				errors: [{ messageId: "banned" }],
			},
			{
				code: `export * from "react";`,
				errors: [{ messageId: "star" }],
			},
			{
				code: `import { useMemo } from "react"; export { useMemo };`,
				errors: [{ messageId: "banned" }],
			},
			{
				code: `import { useEffect as runAfterPaint } from "react"; export { runAfterPaint };`,
				errors: [{ messageId: "banned" }],
			},
			{
				code: `import { useMemo as memo } from "react"; export { memo as useMemo };`,
				errors: [{ messageId: "banned" }],
			},
			{
				code: `import { useCallback } from "react"; export const useLocalCallback = useCallback;`,
				errors: [{ messageId: "banned" }],
			},
			{
				code: `import { useEffect } from "react"; export default useEffect;`,
				errors: [{ messageId: "banned" }],
			},
			{
				code: `export { useCallback as callback } from "react";`,
				errors: [{ messageId: "banned" }],
			},
		],
	},
);
