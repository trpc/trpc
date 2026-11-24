import { defineRule } from '@oxlint/plugins';

const SOURCES = new Set(['@testing-library/dom', '@testing-library/react']);

function nameOf(node: { type: string; name?: string; value?: unknown }) {
  return node.type === 'Identifier' ? node.name : node.value;
}

/**
 * Testing Library's `waitFor` doesn't advance Vitest's fake timers, so a test
 * that uses both hangs. This is a rule rather than `no-restricted-imports`
 * options because an override that sets `no-restricted-imports` replaces those
 * options and would silently drop the ban.
 */
export const noTestingLibraryWaitFor = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow Testing Library's `waitFor` in favor of `vi.waitFor`",
    },
    schema: [],
    messages: {
      banned:
        'Use `vi.waitFor` instead as the Testing Library one does not work with fake timers',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (!SOURCES.has(node.source.value)) return;
        for (const specifier of node.specifiers) {
          // `import * as t` reaches `t.waitFor`.
          if (specifier.type === 'ImportNamespaceSpecifier') {
            context.report({ node: specifier, messageId: 'banned' });
          }
          if (
            specifier.type === 'ImportSpecifier' &&
            nameOf(specifier.imported) === 'waitFor'
          ) {
            context.report({ node: specifier, messageId: 'banned' });
          }
        }
      },
      ExportNamedDeclaration(node) {
        if (!node.source || !SOURCES.has(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (nameOf(specifier.local) !== 'waitFor') continue;
          context.report({ node: specifier, messageId: 'banned' });
        }
      },
      ExportAllDeclaration(node) {
        if (!SOURCES.has(node.source.value)) return;
        context.report({ node, messageId: 'banned' });
      },
    };
  },
});
