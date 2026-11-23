import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

// Adapted from raf-query's `inline-jsx-callback`, which only covers callbacks
// whose one use is a JSX attribute: https://github.com/KATT/raf-query
const REPEATED_METHODS = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'flatMap',
  'forEach',
  'map',
  'reduce',
  'reduceRight',
  'some',
]);
const LOOPS = new Set([
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'WhileStatement',
]);

type Node = ESTree.Node;

function isFunctionValue(node: Node | null | undefined) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression'
  );
}

function isExported(node: Node) {
  const declaration =
    node.type === 'VariableDeclarator' ? node.parent?.parent : node.parent;
  return (
    declaration?.type === 'ExportDefaultDeclaration' ||
    declaration?.type === 'ExportNamedDeclaration'
  );
}

function isInside(inner: Node, outer: Node) {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/**
 * Whether `identifier` runs once per iteration of something `declaration` is
 * outside of, where inlining would create a new function every time.
 */
function isRepeated(identifier: Node, declaration: Node) {
  for (let node = identifier.parent; node; node = node.parent) {
    if (isInside(declaration, node)) return false;
    if (LOOPS.has(node.type)) return true;
    if (
      isFunctionValue(node) &&
      node.parent?.type === 'CallExpression' &&
      node.parent.arguments.includes(node as ESTree.Expression) &&
      node.parent.callee.type === 'MemberExpression' &&
      !node.parent.callee.computed &&
      node.parent.callee.property.type === 'Identifier' &&
      REPEATED_METHODS.has(node.parent.callee.property.name)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * A function, or a variable holding one, that is only used once reads better
 * inlined where it's used.
 *
 * Exported functions, components (React Compiler memoizes them one by one,
 * and routes take them as values), recursive functions, and uses inside a
 * loop or a repeated callback are allowed.
 */
export const noSingleUseFunction = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow local functions that are only used once',
    },
    schema: [],
    messages: {
      inline: '`{{name}}` is only used once. Inline it where it is used.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function check(
      declaration: ESTree.Function | ESTree.VariableDeclarator,
      id: ESTree.BindingIdentifier,
    ) {
      // Components, by React's naming convention
      if (/^[A-Z]/.test(id.name)) return;
      if (isExported(declaration)) return;

      const variable = sourceCode
        .getDeclaredVariables(declaration)
        .find((candidate) => candidate.name === id.name);
      if (!variable) return;

      const reads = variable.references.filter((reference) =>
        reference.isRead(),
      );
      // A recursive function needs its name
      if (
        reads.some((reference) => isInside(reference.identifier, declaration))
      )
        return;
      const [read] = reads;
      if (reads.length !== 1 || !read) return;

      const use = read.identifier;
      if (
        use.parent?.type === 'ExportSpecifier' ||
        isRepeated(use, declaration)
      ) {
        return;
      }

      context.report({
        node: id,
        messageId: 'inline',
        data: { name: id.name },
      });
    }

    return {
      FunctionDeclaration(node) {
        if (node.id) check(node, node.id);
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && isFunctionValue(node.init)) {
          check(node, node.id);
        }
      },
    };
  },
});
