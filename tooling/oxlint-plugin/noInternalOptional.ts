import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

/**
 * The name a top-level function is declared under, or `null` if `node` isn't
 * a top-level `function name()` or `const name = () => {}`.
 */
function topLevelFunctionName(node: FunctionNode): string | null {
  if (node.type === 'FunctionDeclaration') {
    return node.parent.type === 'Program' && node.id ? node.id.name : null;
  }
  const declarator = node.parent;
  if (
    declarator.type !== 'VariableDeclarator' ||
    declarator.init !== node ||
    declarator.id.type !== 'Identifier'
  ) {
    return null;
  }
  return declarator.parent.parent?.type === 'Program'
    ? declarator.id.name
    : null;
}

/**
 * `@oxlint/plugins` types a binding identifier's `optional` as `false`, but
 * it's `true` for `a?: T`.
 */
function isOptional(node: { optional?: boolean }): boolean {
  return node.optional === true;
}

/**
 * Internal parameters are required: absence is passed as `null`, `undefined`,
 * a literal or a symbol. Optionals are only for public APIs, normalised once
 * at the boundary.
 *
 * Checks the parameters of top-level functions the file doesn't export, and
 * object types written inline in them. A non-exported type can still be
 * public through an exported one, so declarations of types aren't checked.
 */
export const noInternalOptional = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Disallow optional and defaulted parameters on functions a file doesn't export",
    },
    schema: [],
    messages: {
      optionalParameter:
        'Internal parameter `{{name}}` is optional - make it required and pass `null`, `undefined`, a literal or a symbol',
      defaultParameter:
        'Internal parameter `{{name}}` has a default - make it required and pass the value at each call site',
      optionalProperty:
        'Internal option `{{name}}` is optional - make it required and pass `null`, `undefined`, a literal or a symbol',
    },
  },
  create(context) {
    const exportedNames = new Set<string>();
    const text = (node: ESTree.Node) => context.sourceCode.getText(node);

    const checkInlineType = (param: {
      typeAnnotation?: ESTree.TSTypeAnnotation | null;
    }) => {
      const annotation = param.typeAnnotation?.typeAnnotation;
      if (annotation?.type !== 'TSTypeLiteral') return;
      for (const member of annotation.members) {
        if (
          (member.type === 'TSPropertySignature' ||
            member.type === 'TSMethodSignature') &&
          member.optional
        ) {
          context.report({
            node: member,
            messageId: 'optionalProperty',
            data: { name: text(member.key) },
          });
        }
      }
    };

    const checkFunction = (node: FunctionNode) => {
      const name = topLevelFunctionName(node);
      if (name === null || exportedNames.has(name)) return;
      for (const param of node.params) {
        // Only class constructors have these, and they aren't top-level.
        if (param.type === 'TSParameterProperty') continue;
        if (param.type === 'AssignmentPattern') {
          context.report({
            node: param,
            messageId: 'defaultParameter',
            data: {
              name:
                param.left.type === 'Identifier'
                  ? param.left.name
                  : text(param.left),
            },
          });
          checkInlineType(param.left);
          continue;
        }
        if (param.type === 'Identifier' && isOptional(param)) {
          context.report({
            node: param,
            messageId: 'optionalParameter',
            data: { name: param.name },
          });
        }
        checkInlineType(param);
      }
    };

    return {
      Program(program) {
        // `export function f()` and `export const f = ...` have an
        // `ExportNamedDeclaration` parent, so `topLevelFunctionName` already
        // skips them. This collects `export { f }` and `export default f`.
        for (const statement of program.body) {
          if (
            statement.type === 'ExportNamedDeclaration' &&
            !statement.source
          ) {
            for (const specifier of statement.specifiers) {
              if (specifier.local.type === 'Identifier') {
                exportedNames.add(specifier.local.name);
              }
            }
          } else if (
            statement.type === 'ExportDefaultDeclaration' &&
            statement.declaration.type === 'Identifier'
          ) {
            exportedNames.add(statement.declaration.name);
          }
        }
      },
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
});
