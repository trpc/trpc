import { defineRule, type ESTree } from '@oxlint/plugins';

/**
 * Tests keep Vitest's default timeouts. A slow test gets faster (fake timers,
 * smaller fixtures) instead of a higher limit.
 */

const TEST_CALLEES = new Set([
  'bench',
  'describe',
  'fdescribe',
  'fit',
  'it',
  'suite',
  'test',
  'xdescribe',
  'xit',
  'xtest',
]);

const CONFIG_KEYS = new Set(['hookTimeout', 'teardownTimeout', 'testTimeout']);

/** Where a bare `timeout` option is a test's: other APIs (locks, fetches) have their own. */
const TIMEOUT_CALLEES = new Set([...TEST_CALLEES, 'expect', 'vi', 'waitFor']);

const keyName = (key: ESTree.Node, computed: boolean) => {
  if (!computed && key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return undefined;
};

/** `test` for `test.skip.each(…)(…)`: the identifier the callee chain starts from. */
const rootName = (callee: ESTree.Node): string | undefined => {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression') return rootName(callee.object);
  if (callee.type === 'CallExpression') return rootName(callee.callee);
  return undefined;
};

const noCustomTestTimeout = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow custom Vitest test, hook, and waitFor timeouts',
    },
    schema: [],
    messages: {
      banned:
        'Custom test timeouts are not allowed. Keep the default Vitest timeout and make the test faster (fake timers, smaller fixtures) instead of raising the limit.',
    },
  },
  create(context) {
    return {
      Property(node) {
        if (node.parent.type !== 'ObjectExpression') return;
        const name = keyName(node.key, node.computed);
        if (name === undefined) return;
        const call = node.parent.parent;
        const testOption =
          name === 'timeout' &&
          call?.type === 'CallExpression' &&
          TIMEOUT_CALLEES.has(rootName(call.callee) ?? '');
        if (CONFIG_KEYS.has(name) || testOption) {
          context.report({ node, messageId: 'banned' });
        }
      },
      CallExpression(node) {
        const name = rootName(node.callee);
        if (name === undefined || !TEST_CALLEES.has(name)) return;
        if (node.arguments.length < 2) return;
        const last = node.arguments.at(-1);
        if (last?.type === 'Literal' && typeof last.value === 'number') {
          context.report({ node: last, messageId: 'banned' });
        }
      },
    };
  },
});

export { noCustomTestTimeout };
