import { defineRule } from '@oxlint/plugins';

/**
 * Type parameters are `T`, `$`, `TName` or `$Name`, optionally numbered
 * (`T1`, `TInput2`) and prefixed with one `_`.
 */
const PATTERN = /^(T|\$)([A-Z]([a-zA-Z]+))?[0-9]*$/;

export const typeParameterNaming = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce `T`/`$`-prefixed PascalCase names for type parameters',
    },
    schema: [],
    messages: {
      pattern: 'Type parameter `{{name}}` must match the RegExp: {{pattern}}',
    },
  },
  create(context) {
    return {
      TSTypeParameter(node) {
        // `infer X` declares a type parameter too, but isn't checked.
        if (node.parent.type !== 'TSTypeParameterDeclaration') return;
        const name = node.name.name;
        const trimmed = name.startsWith('_') ? name.slice(1) : name;
        if (PATTERN.test(trimmed)) return;
        context.report({
          node: node.name,
          messageId: 'pattern',
          data: { name, pattern: String(PATTERN) },
        });
      },
    };
  },
});
