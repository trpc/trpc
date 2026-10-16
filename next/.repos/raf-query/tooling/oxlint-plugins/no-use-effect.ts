import { defineRule } from "@oxlint/plugins";

/**
 * Disallow React's effect hooks outside audited hook seams.
 *
 * App state should come from route search params, queries, actions, or
 * direct user interactions. External subscriptions (timers, observers,
 * storage) belong in audited seams such as the `@raf-query/react` bindings —
 * not in app components.
 */

const BANNED_EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect"]);
const MESSAGE =
	"Do not use React `{{name}}`. Derive state during render, update it in user interactions, or move the subscription into an audited hook seam.";

function importedName(node) {
	return node.imported.type === "Identifier"
		? node.imported.name
		: node.imported.value;
}

function propertyName(node) {
	if (node.property.type === "Identifier" && !node.computed) {
		return node.property.name;
	}
	if (node.property.type === "Literal") {
		return node.property.value;
	}
	return null;
}

const noUseEffect = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow React useEffect and useLayoutEffect",
		},
		schema: [],
		messages: {
			banned: MESSAGE,
		},
	},

	create(context) {
		const reactNamespaces = new Set();

		return {
			ImportSpecifier(node) {
				if (
					node.parent?.type === "ImportDeclaration" &&
					node.parent.source.value === "react" &&
					BANNED_EFFECT_HOOKS.has(importedName(node))
				) {
					context.report({
						node,
						messageId: "banned",
						data: { name: importedName(node) },
					});
				}
			},

			ImportDefaultSpecifier(node) {
				if (
					node.parent?.type === "ImportDeclaration" &&
					node.parent.source.value === "react"
				) {
					reactNamespaces.add(node.local.name);
				}
			},

			ImportNamespaceSpecifier(node) {
				if (
					node.parent?.type === "ImportDeclaration" &&
					node.parent.source.value === "react"
				) {
					reactNamespaces.add(node.local.name);
				}
			},

			MemberExpression(node) {
				if (
					node.object.type === "Identifier" &&
					reactNamespaces.has(node.object.name) &&
					BANNED_EFFECT_HOOKS.has(propertyName(node))
				) {
					context.report({
						node,
						messageId: "banned",
						data: { name: propertyName(node) },
					});
				}
			},

			VariableDeclarator(node) {
				if (
					node.id.type !== "ObjectPattern" ||
					node.init?.type !== "Identifier" ||
					!reactNamespaces.has(node.init.name)
				) {
					return;
				}
				for (const property of node.id.properties) {
					if (
						property.type === "Property" &&
						!property.computed &&
						property.key.type === "Identifier" &&
						BANNED_EFFECT_HOOKS.has(property.key.name)
					) {
						context.report({
							node: property,
							messageId: "banned",
							data: { name: property.key.name },
						});
					}
				}
			},

			ExportNamedDeclaration(node) {
				if (node.source?.value !== "react") {
					return;
				}
				for (const specifier of node.specifiers) {
					if (specifier.type === "ExportSpecifier") {
						const name =
							specifier.local.type === "Identifier"
								? specifier.local.name
								: specifier.local.value;
						if (BANNED_EFFECT_HOOKS.has(name)) {
							context.report({
								node: specifier,
								messageId: "banned",
								data: { name },
							});
						}
					}
				}
			},
		};
	},
});

export { noUseEffect };
