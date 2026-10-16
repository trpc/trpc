import { defineRule } from "@oxlint/plugins";

/**
 * Disallow Vitest/Jest module mocking (`vi.mock`, `vi.hoisted`, …).
 *
 * Prefer real providers, in-memory fakes, and prop injection over
 * replacing modules. Local `vi.fn()` / `vi.spyOn()` / `vi.stubGlobal()` for
 * callbacks and browser host APIs remain allowed.
 */

const BANNED = new Set([
	"mock",
	"doMock",
	"unmock",
	"doUnmock",
	"hoisted",
	"importMock",
	"unstable_mockModule",
]);

const MESSAGE =
	"Module mocking is not allowed. Prefer real providers, in-memory fakes, or prop injection instead of vi.mock / vi.hoisted.";

/** Modules whose exports carry the module-mocking API. */
const MOCK_API_MODULES = new Set(["vitest", "@jest/globals", "vitest/node"]);

/** Names that hold the mocking API even without an import (globals: true). */
const GLOBAL_MOCK_NAMESPACES = ["vi", "jest"];

function reportMockCall(context, node, methodName) {
	context.report({
		node,
		message: `${MESSAGE} (banned: ${methodName})`,
	});
}

function memberName(property, computed) {
	if (!computed && property.type === "Identifier") {
		return property.name;
	}
	if (
		computed &&
		property.type === "Literal" &&
		typeof property.value === "string"
	) {
		return property.value;
	}
	return null;
}

function checkMemberCall(context, node, namespaces) {
	if (node.callee.type !== "MemberExpression") {
		return;
	}
	const object = node.callee.object;
	const property = node.callee.property;
	if (object.type !== "Identifier") {
		return;
	}
	if (!namespaces.has(object.name)) {
		return;
	}
	const name = memberName(property, node.callee.computed);
	if (name == null || !BANNED.has(name)) {
		return;
	}
	reportMockCall(context, node, `${object.name}.${name}`);
}

/**
 * Records the local names that hold the mocking API, so `import { vi as v }`
 * and `import * as vitest from "vitest"` cannot slip past the member check.
 */
function collectImportedNamespaces(node, namespaces) {
	if (
		node.source.type !== "Literal" ||
		!MOCK_API_MODULES.has(node.source.value)
	) {
		return;
	}
	for (const specifier of node.specifiers) {
		if (specifier.type === "ImportNamespaceSpecifier") {
			namespaces.add(specifier.local.name);
			continue;
		}
		if (
			specifier.type === "ImportSpecifier" &&
			specifier.imported.type === "Identifier" &&
			GLOBAL_MOCK_NAMESPACES.includes(specifier.imported.name)
		) {
			namespaces.add(specifier.local.name);
		}
	}
}

/**
 * Flags `const { mock } = vi` at the destructure, since the resulting local
 * call is an ordinary identifier call the member check cannot recognise.
 */
function checkDestructuredMock(context, node, namespaces) {
	if (
		node.init == null ||
		node.init.type !== "Identifier" ||
		!namespaces.has(node.init.name) ||
		node.id.type !== "ObjectPattern"
	) {
		return;
	}
	for (const property of node.id.properties) {
		if (property.type !== "Property") {
			continue;
		}
		const name = memberName(property.key, property.computed);
		if (name != null && BANNED.has(name)) {
			reportMockCall(context, property, `${node.init.name}.${name}`);
		}
	}
}

const noMock = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Vitest/Jest module mocking in favor of real test infrastructure",
		},
		schema: [],
	},

	create(context) {
		const namespaces = new Set(GLOBAL_MOCK_NAMESPACES);
		return {
			ImportDeclaration(node) {
				collectImportedNamespaces(node, namespaces);
			},
			VariableDeclarator(node) {
				checkDestructuredMock(context, node, namespaces);
			},
			CallExpression(node) {
				checkMemberCall(context, node, namespaces);
			},
		};
	},
});

export { noMock };
