import { defineRule } from '@oxlint/plugins';

const SWITCHES = new Set(['useFakeTimers', 'useRealTimers']);

/** Vitest's fake timer controls; `fakeTimersResource()` returns the ones tests use. */
const CONTROLS = new Set([
  'advanceTimersByTime',
  'advanceTimersByTimeAsync',
  'advanceTimersToNextFrame',
  'advanceTimersToNextTimer',
  'advanceTimersToNextTimerAsync',
  'clearAllTimers',
  'getTimerCount',
  'runAllTicks',
  'runAllTimers',
  'runAllTimersAsync',
  'runOnlyPendingTimers',
  'runOnlyPendingTimersAsync',
]);

/**
 * A test that throws between `vi.useFakeTimers()` and `vi.useRealTimers()`
 * leaks fake timers into the next test. `fakeTimersResource()` restores real
 * timers when its scope ends, whatever happens in between. Timer controls go
 * through the resource too, so a test can only drive fake timers it holds.
 */
export const noDirectFakeTimers = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `vi.useFakeTimers()`, `vi.useRealTimers()` and fake timer controls on `vi` in favor of `using timers = fakeTimersResource()`',
    },
    schema: [],
    messages: {
      banned:
        '`vi.{{name}}()` can leak fake timers into the next test - use `using _timers = fakeTimersResource()` from `@trpc/server/__tests__/fakeTimersResource`',
      control:
        'Call `{{name}}()` on the `fakeTimersResource()` that set up the fake timers, not on `vi`',
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
        if (name === null) return;
        if (SWITCHES.has(name)) {
          context.report({ node, messageId: 'banned', data: { name } });
        }
        if (CONTROLS.has(name)) {
          context.report({ node, messageId: 'control', data: { name } });
        }
      },
    };
  },
});
