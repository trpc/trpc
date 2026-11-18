import { defineRule } from '@oxlint/plugins';

const SOURCES = new Set(['@testing-library/dom', '@testing-library/react']);

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
      ImportSpecifier(node) {
        if (node.parent.type !== 'ImportDeclaration') return;
        if (!SOURCES.has(node.parent.source.value)) return;
        const imported = node.imported;
        const name =
          imported.type === 'Identifier' ? imported.name : imported.value;
        if (name !== 'waitFor') return;
        context.report({ node, messageId: 'banned' });
      },
    };
  },
});
