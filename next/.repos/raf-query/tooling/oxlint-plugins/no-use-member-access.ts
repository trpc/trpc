import { defineRule } from "@oxlint/plugins";

/**
 * Ban reading a member straight off React's `use()`: `use(postPromise).title`,
 * `use(itemsPromise).map(…)`, `React.use(p)?.[0]`. Read the value onto its own
 * line, `const post = use(postPromise)`, so the line that can suspend is
 * visible and the value has a name.
 */

function unwrap(node) {
	let current = node;
	while (
		current?.type === "ParenthesizedExpression" ||
		current?.type === "TSNonNullExpression"
	) {
		current = current.expression;
	}
	return current;
}

function isUseCall(node) {
	if (node?.type !== "CallExpression") {
		return false;
	}
	const callee = node.callee;
	if (callee.type === "Identifier") {
		return callee.name === "use";
	}
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "React" &&
		callee.property.type === "Identifier" &&
		callee.property.name === "use"
	);
}

const noUseMemberAccess = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description: "Disallow member access on the result of React's `use()`",
		},
		schema: [],
		messages: {
			memberAccess:
				"Read `use()` into a variable first: `const post = use(postPromise);`, then `post.title`.",
		},
	},

	create(context) {
		return {
			MemberExpression(node) {
				if (isUseCall(unwrap(node.object))) {
					context.report({ node, messageId: "memberAccess" });
				}
			},
		};
	},
});

export { noUseMemberAccess };
