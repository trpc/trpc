import { defineRule } from "@oxlint/plugins";

/**
 * Require locally declared callbacks with one JSX attribute reference to be
 * defined at that attribute.
 *
 * Stable listener identities, callbacks reused in repeated iteration, exported
 * functions, and generated files are intentionally outside this rule.
 */

const GENERATED_PATH_SEGMENT =
	/(?:^|[/\\])(?:_generated|paraglide)(?:[/\\]|$)|[.]gen[.]/;
const REPEATED_METHODS = new Set([
	"every",
	"filter",
	"find",
	"findIndex",
	"flatMap",
	"forEach",
	"map",
	"reduce",
	"reduceRight",
	"some",
]);

function isGeneratedFile(filename) {
	return GENERATED_PATH_SEGMENT.test(filename);
}

function isFunctionValue(node) {
	return (
		node?.type === "ArrowFunctionExpression" ||
		node?.type === "FunctionExpression"
	);
}

function isExported(node) {
	return (
		node.parent?.type === "ExportDefaultDeclaration" ||
		node.parent?.type === "ExportNamedDeclaration"
	);
}

function jsxAttributeFor(identifier) {
	const container = identifier.parent;
	if (
		container?.type !== "JSXExpressionContainer" ||
		container.expression !== identifier
	) {
		return null;
	}
	return container.parent?.type === "JSXAttribute" ? container.parent : null;
}

function repeatedCallbackFor(identifier, declaration) {
	let current = identifier.parent;
	while (current) {
		if (
			(current.type === "ArrowFunctionExpression" ||
				current.type === "FunctionExpression") &&
			current.parent?.type === "CallExpression" &&
			current.parent.arguments.includes(current) &&
			current.parent.callee.type === "MemberExpression" &&
			!current.parent.callee.computed &&
			current.parent.callee.property.type === "Identifier" &&
			REPEATED_METHODS.has(current.parent.callee.property.name)
		) {
			const declarationIsInsideCallback =
				current.start <= declaration.start && declaration.end <= current.end;
			if (!declarationIsInsideCallback) {
				return current;
			}
		}
		current = current.parent;
	}
	return null;
}

function inlineExpression(sourceCode, declaration) {
	if (declaration.type === "VariableDeclarator") {
		return sourceCode.getText(declaration.init);
	}

	if (!declaration.generator && !declaration.typeParameters) {
		const asyncPrefix = declaration.async ? "async " : "";
		const params = declaration.params
			.map((param) => sourceCode.getText(param))
			.join(", ");
		const returnType = declaration.returnType
			? sourceCode.getText(declaration.returnType)
			: "";
		return `${asyncPrefix}(${params})${returnType} => ${sourceCode.getText(declaration.body)}`;
	}

	const text = sourceCode.getText(declaration);
	const relativeNameStart = declaration.id.start - declaration.start;
	const relativeNameEnd = declaration.id.end - declaration.start;
	return `${text.slice(0, relativeNameStart)}${text.slice(relativeNameEnd)}`;
}

function removableDeclaration(declaration) {
	if (declaration.type === "FunctionDeclaration") {
		return declaration;
	}

	const variableDeclaration = declaration.parent;
	if (
		variableDeclaration?.type === "VariableDeclaration" &&
		variableDeclaration.declarations.length === 1
	) {
		return variableDeclaration;
	}
	return null;
}

function declarationRemovalRange(sourceCode, declaration) {
	const lineStart =
		sourceCode.text.lastIndexOf("\n", declaration.start - 1) + 1;
	const nextLineBreak = sourceCode.text.indexOf("\n", declaration.end);
	const lineEnd =
		nextLineBreak === -1 ? sourceCode.text.length : nextLineBreak + 1;
	const onlyIndentBefore =
		sourceCode.text.slice(lineStart, declaration.start).trim() === "";
	const onlyWhitespaceAfter =
		sourceCode.text.slice(declaration.end, lineEnd).trim() === "";
	return [
		onlyIndentBefore ? lineStart : declaration.start,
		onlyWhitespaceAfter ? lineEnd : declaration.end,
	];
}

const inlineJsxCallback = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Inline a locally declared callback when its only reference is a JSX attribute",
		},
		schema: [],
		hasSuggestions: true,
		messages: {
			inline:
				"`{{name}}` is only used by this JSX attribute. Define the callback at the use site.",
			inlineSuggestion: "Inline `{{name}}` here",
		},
	},

	create(context) {
		if (isGeneratedFile(context.physicalFilename)) {
			return {};
		}

		const sourceCode = context.sourceCode;

		function checkDeclaration(declaration) {
			if (isExported(declaration)) {
				return;
			}

			const variables = sourceCode.getDeclaredVariables(declaration);
			const variable = variables.find(
				(candidate) => candidate.name === declaration.id.name,
			);
			if (!variable) {
				return;
			}

			const references = variable.references.filter((reference) =>
				reference.isRead(),
			);
			if (references.length !== 1) {
				return;
			}

			const reference = references[0];
			if (reference === undefined) {
				return;
			}
			const attribute = jsxAttributeFor(reference.identifier);
			if (
				!attribute ||
				repeatedCallbackFor(reference.identifier, declaration)
			) {
				return;
			}

			const removable = removableDeclaration(declaration);
			const suggest = removable
				? [
						{
							messageId: "inlineSuggestion",
							data: { name: variable.name },
							fix(fixer) {
								return [
									fixer.replaceText(
										reference.identifier,
										inlineExpression(sourceCode, declaration),
									),
									fixer.removeRange(
										declarationRemovalRange(sourceCode, removable),
									),
								];
							},
						},
					]
				: null;

			context.report({
				node: declaration.id,
				messageId: "inline",
				data: { name: variable.name },
				suggest,
			});
		}

		return {
			FunctionDeclaration(node) {
				if (node.id) {
					checkDeclaration(node);
				}
			},
			VariableDeclarator(node) {
				if (node.id.type === "Identifier" && isFunctionValue(node.init)) {
					checkDeclaration(node);
				}
			},
		};
	},
});

export { inlineJsxCallback };
