import { defineRule } from '@oxlint/plugins';

const REPLACEMENTS: Record<string, string> = {
  asyncDispose: 'makeAsyncResource()',
  dispose: 'makeResource()',
};

/**
 * `Symbol.dispose` and `Symbol.asyncDispose` aren't available in every runtime
 * we support, so code goes through the polyfilled helpers in `disposable.ts`.
 */
export const noSymbolDispose = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `Symbol.dispose`/`Symbol.asyncDispose` in favor of `makeResource()`/`makeAsyncResource()`',
    },
    schema: [],
    messages: {
      banned: 'Usage of Symbol.{{name}} is not allowed - use `{{replacement}}`',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object.type !== 'Identifier' || node.object.name !== 'Symbol')
          return;
        if (node.property.type !== 'Identifier') return;
        const name = node.property.name;
        const replacement = REPLACEMENTS[name];
        if (!replacement) return;
        context.report({
          node,
          messageId: 'banned',
          data: { name, replacement },
        });
      },
    };
  },
});
