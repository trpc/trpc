import { defineRule, type ESTree } from '@oxlint/plugins';

/**
 * Tests use real providers, in-memory fakes and injection, not module mocks
 * (`vi.mock`, `vi.hoisted`, …). `vi.fn()`, `vi.spyOn()` and `vi.stubGlobal()`
 * stay allowed for callbacks and host APIs.
 */

const BANNED = new Set([
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'hoisted',
  'importMock',
  'unstable_mockModule',
]);

/** Modules whose exports carry the module-mocking API. */
const MOCK_API_MODULES = new Set([
  'vitest',
  'vitest/node',
  'vite-plus/test',
  '@jest/globals',
]);

/** Names that hold the mocking API even without an import (`globals: true`). */
const GLOBAL_NAMESPACES = ['vi', 'jest'];

const memberName = (property: ESTree.Node, computed: boolean) => {
  if (!computed && property.type === 'Identifier') return property.name;
  if (
    computed &&
    property.type === 'Literal' &&
    typeof property.value === 'string'
  ) {
    return property.value;
  }
  return undefined;
};

const noMock = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Vitest/Jest module mocking in favor of real test infrastructure',
    },
    schema: [],
    messages: {
      banned:
        'Module mocking is not allowed. Use a real provider, an in-memory fake or injection instead (banned: {{name}}).',
    },
  },
  create(context) {
    const namespaces = new Set(GLOBAL_NAMESPACES);
    const report = (node: ESTree.Node, namespace: string, name: string) => {
      context.report({
        node,
        messageId: 'banned',
        data: { name: `${namespace}.${name}` },
      });
    };
    return {
      // `import { vi as v }` and `import * as vitest` hold the API too.
      ImportDeclaration(node) {
        if (!MOCK_API_MODULES.has(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportNamespaceSpecifier' ||
            (specifier.type === 'ImportSpecifier' &&
              specifier.imported.type === 'Identifier' &&
              GLOBAL_NAMESPACES.includes(specifier.imported.name))
          ) {
            namespaces.add(specifier.local.name);
          }
        }
      },
      // `const { mock } = vi` makes a plain call the member check can't see.
      VariableDeclarator(node) {
        if (
          node.init?.type !== 'Identifier' ||
          !namespaces.has(node.init.name) ||
          node.id.type !== 'ObjectPattern'
        ) {
          return;
        }
        for (const property of node.id.properties) {
          if (property.type !== 'Property') continue;
          const name = memberName(property.key, property.computed);
          if (name !== undefined && BANNED.has(name)) {
            report(property, node.init.name, name);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.object.type !== 'Identifier' ||
          !namespaces.has(callee.object.name)
        ) {
          return;
        }
        const name = memberName(callee.property, callee.computed);
        if (name !== undefined && BANNED.has(name)) {
          report(node, callee.object.name, name);
        }
      },
    };
  },
});

export { noMock };
