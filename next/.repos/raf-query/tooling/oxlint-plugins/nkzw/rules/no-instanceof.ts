import { defineRule } from "@oxlint/plugins";

const MESSAGE = 'The "instanceof" operator is not allowed.';

export const noInstanceofRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow instanceof except for Error and Exception constructors",
		},
		schema: [],
		messages: {
			banned: MESSAGE,
		},
	},

	create(context) {
		return {
			BinaryExpression(node) {
				if (node.operator !== "instanceof") {
					return;
				}
				if (
					node.right.type === "Identifier" &&
					(node.right.name.endsWith("Error") ||
						node.right.name.endsWith("Exception"))
				) {
					return;
				}
				context.report({ node, messageId: "banned" });
			},
		};
	},
});
