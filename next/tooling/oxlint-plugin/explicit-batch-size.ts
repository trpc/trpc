import { defineRule, type ESTree } from '@oxlint/plugins';

/**
 * Batching names its size: `batch: { maxItems }` or `batch: false` on
 * `createFetchHandler`, `createV11Handler` and `httpLink`, and a `batch` on
 * every `createV11Handler` ([`explicit-batch-size.md`](../../.agent-docs/decisions/explicit-batch-size.md)).
 * The types say so too; this covers the code no compiler sees, such as docs
 * blocks without twoslash.
 */

const BATCHING = new Set([
  'createFetchHandler',
  'createV11Handler',
  'httpLink',
]);

const keyName = (prop: ESTree.Node) =>
  prop.type === 'Property' && !prop.computed && prop.key.type === 'Identifier'
    ? prop.key.name
    : undefined;

const explicitBatchSize = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require an explicit batch size wherever a handler or link batches',
    },
    schema: [],
    messages: {
      noSize:
        'Batching needs an explicit size: `batch: { maxItems: 100 }`, or `batch: false`.',
      noBatch:
        "`createV11Handler` needs `batch`: `{ maxItems: 100 }` for v11's batch links, or `false`.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return;
        const name = node.callee.name;
        const options = node.arguments[0];
        if (!BATCHING.has(name) || options?.type !== 'ObjectExpression') return;
        const props = options.properties;
        const batch = props.find((p) => keyName(p) === 'batch');
        if (batch?.type === 'Property') {
          const value = batch.value;
          const sized =
            value.type === 'ObjectExpression' &&
            value.properties.some(
              (p) => p.type === 'SpreadElement' || keyName(p) === 'maxItems',
            );
          if (
            (value.type === 'Literal' && value.value === true) ||
            (value.type === 'ObjectExpression' && !sized)
          ) {
            context.report({ node: batch, messageId: 'noSize' });
          }
        } else if (
          name === 'createV11Handler' &&
          !props.some((p) => p.type === 'SpreadElement')
        ) {
          context.report({ node: options, messageId: 'noBatch' });
        }
      },
    };
  },
});

export { explicitBatchSize };
