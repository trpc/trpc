import { defineRule } from '@oxlint/plugins';

const METHODS = new Set(['useFakeTimers', 'useRealTimers']);

/**
 * A test that throws between `vi.useFakeTimers()` and `vi.useRealTimers()`
 * leaks fake timers into the next test. `fakeTimersResource()` restores real
 * timers when its scope ends, whatever happens in between.
 */
export const noDirectFakeTimers = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `vi.useFakeTimers()`/`vi.useRealTimers()` in favor of `using _timers = fakeTimersResource()`',
    },
    schema: [],
    messages: {
      banned:
        '`vi.{{name}}()` can leak fake timers into the next test - use `using _timers = fakeTimersResource()` from `@trpc/server/__tests__/fakeTimersResource`',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.object.type !== 'Identifier' || callee.object.name !== 'vi')
          return;
        const property = callee.property;
        // `vi.useFakeTimers()` or `vi['useFakeTimers']()`.
        const name =
          property.type === 'Identifier' && !callee.computed
            ? property.name
            : property.type === 'Literal' && typeof property.value === 'string'
              ? property.value
              : null;
        if (name === null || !METHODS.has(name)) return;
        context.report({ node, messageId: 'banned', data: { name } });
      },
    };
  },
});
