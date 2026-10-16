import { defineRule } from "@oxlint/plugins";

/**
 * Disallow custom Vitest timeouts. Slow tests should be made faster (fake
 * timers, smaller fixtures) instead of raising the default 5s budget.
 */

const TEST_CALLEES = new Set([
	"bench",
	"describe",
	"fdescribe",
	"fit",
	"it",
	"suite",
	"test",
	"xdescribe",
	"xit",
	"xtest",
]);

const TIMEOUT_KEYS = new Set([
	"hookTimeout",
	"teardownTimeout",
	"testTimeout",
	"timeout",
]);

const MESSAGE =
	"Custom test timeouts are not allowed. Keep the default Vitest timeout and make the test faster (fake timers, smaller fixtures) instead of raising the limit.";

function memberName(property, computed) {
	if (!computed && property.type === "Identifier") {
		return property.name;
	}
	if (property.type === "Literal" && typeof property.value === "string") {
		return property.value;
	}
	return null;
}

function callRootName(callee) {
	let current = callee;
	for (;;) {
		if (current.type === "Identifier") {
			return current.name;
		}
		if (current.type === "MemberExpression") {
			current = current.object;
			continue;
		}
		if (current.type === "CallExpression") {
			current = current.callee;
			continue;
		}
		return null;
	}
}

function isNumericTimeoutArg(node) {
	return node.type === "Literal" && typeof node.value === "number";
}

export const noCustomTestTimeout = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow custom Vitest test, hook, and waitFor timeouts",
		},
		schema: [],
		messages: {
			banned: MESSAGE,
		},
	},

	create(context) {
		return {
			Property(node) {
				const name = memberName(node.key, node.computed);
				if (name == null || !TIMEOUT_KEYS.has(name)) {
					return;
				}
				context.report({ node, messageId: "banned" });
			},

			CallExpression(node) {
				const rootName = callRootName(node.callee);
				if (rootName == null || !TEST_CALLEES.has(rootName)) {
					return;
				}
				if (node.arguments.length < 2) {
					return;
				}
				const last = node.arguments[node.arguments.length - 1];
				if (last != null && isNumericTimeoutArg(last)) {
					context.report({ node: last, messageId: "banned" });
				}
			},
		};
	},
});
