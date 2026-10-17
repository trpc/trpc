import {
  defineRule,
  type ESTree,
  type Reference,
  type SourceCode,
} from '@oxlint/plugins';

/**
 * A destructured local is read at least three times; below that, read the
 * field where it's used (`opts.input`, `post.title`). Applies to parameters,
 * variables and call results (`const { title } = use(postPromise)`). Rest
 * patterns, spreads, JSX tag names and exported declarations (read by other
 * modules) are left alone.
 */

const MINIMUM_READS = 3;

type Fn = ESTree.ArrowFunctionExpression | ESTree.Function;

const isFunction = (node: ESTree.Node | null | undefined): node is Fn =>
  node?.type === 'ArrowFunctionExpression' ||
  node?.type === 'FunctionDeclaration' ||
  node?.type === 'FunctionExpression';

const containingFunction = (node: ESTree.Node) => {
  let current = node.parent;
  while (current && !isFunction(current)) current = current.parent;
  return current;
};

interface Binding {
  name: string;
  node: ESTree.Node;
  key: string;
}

const bindingOf = (property: ESTree.Node): Binding | undefined => {
  if (
    property.type !== 'Property' ||
    property.computed ||
    property.key.type !== 'Identifier'
  ) {
    return undefined;
  }
  const value =
    property.value.type === 'AssignmentPattern'
      ? property.value.left
      : property.value;
  if (value.type !== 'Identifier') return undefined;
  return { name: value.name, node: value, key: property.key.name };
};

/** Source text of a side-effect-free `a` / `a.b.c` initializer. */
const memberSource = (
  sourceCode: SourceCode,
  node: ESTree.Node,
): string | undefined => {
  if (node.type === 'Identifier') return node.name;
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    !node.optional &&
    node.property.type === 'Identifier' &&
    memberSource(sourceCode, node.object) !== undefined
  ) {
    return sourceCode.getText(node);
  }
  return undefined;
};

const reads = (
  sourceCode: SourceCode,
  declaration: ESTree.Node,
  name: string,
): Reference[] =>
  sourceCode
    .getDeclaredVariables(declaration)
    .find((variable) => variable.name === name)
    ?.references.filter((reference) => reference.isRead()) ?? [];

const allowed = (references: Reference[]) =>
  references.length >= MINIMUM_READS ||
  references.some((reference) => {
    const parent = reference.identifier.parent;
    return (
      parent?.type === 'SpreadElement' ||
      parent?.type === 'JSXSpreadAttribute' ||
      parent?.type === 'JSXOpeningElement' ||
      parent?.type === 'JSXClosingElement'
    );
  });

const usesRest = (pattern: ESTree.ObjectPattern) =>
  pattern.properties.some((property) => property.type === 'RestElement');

/** The line a lone declaration sits on, or just its own text when it shares one. */
const removalRange = (
  sourceCode: SourceCode,
  node: ESTree.Node,
): [number, number] => {
  const text = sourceCode.text;
  const lineStart = text.lastIndexOf('\n', node.start - 1) + 1;
  const nextBreak = text.indexOf('\n', node.end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak + 1;
  return [
    text.slice(lineStart, node.start).trim() === '' ? lineStart : node.start,
    text.slice(node.end, lineEnd).trim() === '' ? lineEnd : node.end,
  ];
};

const noOverzealousDestructuring = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow destructuring a field used fewer than three times',
    },
    schema: [],
    hasSuggestions: true,
    messages: {
      body: '`{{name}}` is read {{count}} time(s). Use `{{member}}` directly until destructuring removes at least three repeated accesses.',
      parameter:
        '`{{name}}` is read {{count}} time(s). Accept an object parameter and access this field directly until it has at least three reads.',
      value:
        '`{{name}}` is read {{count}} time(s). Bind the whole value to a named variable and read `.{{field}}` from it, e.g. `const post = use(promise)` then `post.{{field}}`.',
      directSuggestion: 'Replace `{{name}}` with direct member access',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    const checkFunction = (fn: Fn) => {
      // Overload signatures and `declare function` have no body to read in.
      if (!fn.body) return;
      for (const pattern of fn.params) {
        if (pattern.type !== 'ObjectPattern' || usesRest(pattern)) continue;
        for (const property of pattern.properties) {
          const binding = bindingOf(property);
          if (!binding) continue;
          const references = reads(sourceCode, fn, binding.name);
          if (allowed(references)) continue;
          context.report({
            node: binding.node,
            messageId: 'parameter',
            data: { name: binding.name, count: String(references.length) },
          });
        }
      }
    };

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      VariableDeclarator(node) {
        const declaration = node.parent;
        if (
          declaration.type !== 'VariableDeclaration' ||
          declaration.kind !== 'const' ||
          declaration.parent?.type === 'ExportNamedDeclaration' ||
          node.id.type !== 'ObjectPattern' ||
          !node.init ||
          usesRest(node.id)
        ) {
          return;
        }
        const source = memberSource(sourceCode, node.init);
        const lone = node.id.properties.length === 1;
        for (const property of node.id.properties) {
          const binding = bindingOf(property);
          if (!binding) continue;
          const references = reads(sourceCode, node, binding.name);
          if (allowed(references)) continue;
          const count = String(references.length);
          if (source === undefined) {
            context.report({
              node: binding.node,
              messageId: 'value',
              data: { name: binding.name, count, field: binding.key },
            });
            continue;
          }
          const member = `${source}.${binding.key}`;
          const fn = containingFunction(node);
          const suggestable =
            lone &&
            declaration.declarations.length === 1 &&
            references.every(
              (reference) => containingFunction(reference.identifier) === fn,
            );
          context.report({
            node: binding.node,
            messageId: 'body',
            data: { name: binding.name, count, member },
            suggest: suggestable
              ? [
                  {
                    messageId: 'directSuggestion',
                    data: { name: binding.name },
                    fix: (fixer) => [
                      ...references.map((reference) => {
                        const parent = reference.identifier.parent;
                        return parent?.type === 'Property' &&
                          parent.shorthand &&
                          parent.parent?.type === 'ObjectExpression'
                          ? fixer.replaceText(
                              parent,
                              `${binding.name}: ${member}`,
                            )
                          : fixer.replaceText(reference.identifier, member);
                      }),
                      fixer.removeRange(removalRange(sourceCode, declaration)),
                    ],
                  },
                ]
              : null,
          });
        }
      },
    };
  },
});

export { noOverzealousDestructuring };
