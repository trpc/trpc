import { defineRule } from "@oxlint/plugins";

function importedName(node) {
	return node.imported.type === "Identifier"
		? node.imported.name
		: node.imported.value;
}

export const requireUseEffectArgumentsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Require useEffect calls to pass a dependency array",
		},
		schema: [],
		messages: {
			missing:
				"{{name}} must be called with a second argument (dependency array).",
		},
	},

	create(context) {
		const useEffectNames = new Set();

		return {
			ImportDeclaration(node) {
				if (node.source.value !== "react") {
					return;
				}
				for (const specifier of node.specifiers) {
					if (
						specifier.type === "ImportSpecifier" &&
						importedName(specifier) === "useEffect"
					) {
						useEffectNames.add(specifier.local.name);
					} else if (specifier.type === "ImportDefaultSpecifier") {
						useEffectNames.add(`${specifier.local.name}.useEffect`);
					}
				}
			},

			CallExpression(node) {
				let name: string | null = null;
				if (node.callee.type === "Identifier") {
					name = node.callee.name;
				} else if (node.callee.type === "MemberExpression") {
					const object = node.callee.object;
					const property = node.callee.property;
					if (
						object.type === "Identifier" &&
						property.type === "Identifier" &&
						!node.callee.computed
					) {
						name = `${object.name}.${property.name}`;
					}
				}

				if (name && useEffectNames.has(name) && node.arguments.length < 2) {
					context.report({
						node,
						messageId: "missing",
						data: { name },
					});
				}
			},
		};
	},
});
