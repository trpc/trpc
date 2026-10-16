/**
 * Rules for codebases that rely on React Compiler for memoization.
 */

import { defineRule } from "@oxlint/plugins";

const MESSAGE = "React Compiler handles memoization automatically.";
const MANUAL_MEMOIZATION_HOOKS = new Set(["useCallback", "useMemo"]);

function propertyName(node) {
	if (node.type === "Identifier") {
		return node.name;
	}
	if (node.type === "Literal") {
		return node.value;
	}
	return null;
}

function isManualMemoHook(name) {
	return typeof name === "string" && MANUAL_MEMOIZATION_HOOKS.has(name);
}

function reportManualMemoization(context, node) {
	context.report({ messageId: "banned", node });
}

export const noManualMemoization = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow manual useCallback and useMemo calls when React Compiler is enabled",
		},
		schema: [],
		messages: {
			banned: MESSAGE,
		},
	},

	create(context) {
		return {
			ImportSpecifier(node) {
				const declaration = node.parent;
				if (
					declaration?.type === "ImportDeclaration" &&
					declaration.source.value === "react" &&
					isManualMemoHook(propertyName(node.imported))
				) {
					reportManualMemoization(context, node);
				}
			},

			MemberExpression(node) {
				if (isManualMemoHook(propertyName(node.property))) {
					reportManualMemoization(context, node);
				}
			},

			Property(node) {
				if (
					node.parent?.type === "ObjectPattern" &&
					isManualMemoHook(propertyName(node.key))
				) {
					reportManualMemoization(context, node);
				}
			},
		};
	},
});
