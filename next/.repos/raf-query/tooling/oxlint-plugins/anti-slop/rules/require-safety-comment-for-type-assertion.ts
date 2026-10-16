import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

const safetyComment = /\bSAFETY\s*:/u;

function isConstAssertion(node: TypeAssertion): boolean {
	return (
		node.typeAnnotation.type === "TSTypeReference" &&
		node.typeAnnotation.typeName.type === "Identifier" &&
		node.typeAnnotation.typeName.name === "const"
	);
}

function isSafetyComment(comment: { readonly value: string }): boolean {
	return safetyComment.test(comment.value);
}

/** The assertion chain, including parentheses around it or between links. */
function assertionChainRoot(node: TypeAssertion): ESTree.Node {
	let current: ESTree.Node = node;
	while (true) {
		let wrapped = current;
		while (
			wrapped.parent.type === "ParenthesizedExpression" &&
			wrapped.parent.expression === wrapped
		) {
			wrapped = wrapped.parent;
		}
		const { parent } = wrapped;
		if (
			(parent.type === "TSAsExpression" || parent.type === "TSTypeAssertion") &&
			parent.expression === wrapped
		) {
			current = parent;
			continue;
		}
		return wrapped;
	}
}

/**
 * The statement a comment may sit on, when this assertion is that
 * statement's value (`return value as T`, `const value = input as T`).
 * An assertion nested in a call, ternary, or other expression has none.
 */
function owningStatement(assertion: TypeAssertion): ESTree.Node | null {
	const root = assertionChainRoot(assertion);
	const { parent } = root;
	if (parent === null) return null;
	if (parent.type === "VariableDeclarator" && parent.init === root) {
		const declaration = parent.parent;
		if (
			declaration.type !== "VariableDeclaration" ||
			declaration.declarations[0] !== parent
		) {
			return null;
		}
		const exported = declaration.parent;
		if (
			(exported.type === "ExportNamedDeclaration" ||
				exported.type === "ExportDefaultDeclaration") &&
			exported.declaration === declaration
		) {
			return exported;
		}
		return declaration;
	}
	if (parent.type === "ReturnStatement" && parent.argument === root)
		return parent;
	if (parent.type === "ThrowStatement" && parent.argument === root)
		return parent;
	if (parent.type === "ExpressionStatement" && parent.expression === root)
		return parent;
	if (parent.type === "PropertyDefinition" && parent.value === root)
		return parent;
	if (
		parent.type === "ExportDefaultDeclaration" &&
		parent.declaration === root
	) {
		return parent;
	}
	if (
		parent.type === "AssignmentExpression" &&
		parent.operator === "=" &&
		parent.right === root &&
		parent.parent.type === "ExpressionStatement" &&
		parent.parent.expression === parent
	) {
		return parent.parent;
	}
	return null;
}

/** A `SAFETY:` comment with only whitespace, comments, or wrapping `(` before the assertion. */
function hasAdjacentSafetyComment(
	sourceCode: SourceCode,
	node: TypeAssertion,
): boolean {
	const text = sourceCode.text;
	const byEnd = new Map(
		sourceCode.getAllComments().map((comment) => [comment.end, comment]),
	);
	let cursor = node.start;
	while (cursor > 0) {
		const comment = byEnd.get(cursor);
		if (comment !== undefined) {
			if (isSafetyComment(comment)) return true;
			cursor = comment.start;
			continue;
		}
		const char = text[cursor - 1];
		if (char !== undefined && (char === "(" || /\s/u.test(char))) {
			cursor -= 1;
			continue;
		}
		return false;
	}
	return false;
}

function hasSafetyComment(
	sourceCode: SourceCode,
	node: TypeAssertion,
): boolean {
	const statement = owningStatement(node);
	if (
		statement !== null &&
		sourceCode
			.getCommentsBefore(statement)
			.some((comment) => comment.end <= node.start && isSafetyComment(comment))
	) {
		return true;
	}
	return hasAdjacentSafetyComment(sourceCode, node);
}

/** Require every non-const type assertion to state the invariant TypeScript cannot express. */
export const requireSafetyCommentForTypeAssertionRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require a SAFETY comment immediately before every TypeScript type assertion except const assertions. A comment on a statement covers the assertion only when the assertion is that statement's value.",
		},
		messages: {
			missingSafetyComment:
				"This type assertion has no `SAFETY:` justification immediately before it. A comment on the surrounding statement only covers an assertion that is that statement's value.",
		},
	},
	createOnce(context) {
		const checkAssertion = (node: TypeAssertion) => {
			if (isConstAssertion(node) || hasSafetyComment(context.sourceCode, node))
				return;
			context.report({ node, messageId: "missingSafetyComment" });
		};

		return {
			TSAsExpression: checkAssertion,
			TSTypeAssertion: checkAssertion,
		};
	},
});
