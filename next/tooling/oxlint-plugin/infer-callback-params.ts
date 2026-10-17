import { defineRule, type ESTree } from '@oxlint/plugins';

/**
 * A callback passed to a call, a JSX attribute or an option object inside a
 * call leaves its parameters to inference from that boundary. Standalone
 * functions and function-valued properties without a contextual type are
 * outside the rule. Syntactic: it can't tell an annotation that drives a
 * generic's inference from one that repeats it, so it suits app code
 * (examples), not library tests.
 */

const TRANSPARENT = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSInstantiationExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

const isContextual = (node: ESTree.Node): boolean => {
  let candidate = node;
  let parent = candidate.parent;
  while (parent) {
    if (TRANSPARENT.has(parent.type)) {
      candidate = parent;
      parent = candidate.parent;
      continue;
    }
    if (
      parent.type === 'JSXExpressionContainer' &&
      parent.expression === candidate &&
      parent.parent?.type === 'JSXAttribute'
    ) {
      return true;
    }
    if (
      (parent.type === 'CallExpression' || parent.type === 'NewExpression') &&
      parent.arguments.some((argument) => argument === candidate)
    ) {
      return true;
    }
    if (
      parent.type === 'Property' &&
      parent.value === candidate &&
      parent.parent?.type === 'ObjectExpression'
    ) {
      candidate = parent.parent;
      parent = candidate.parent;
      continue;
    }
    if (
      (parent.type === 'ArrayExpression' &&
        parent.elements.some((element) => element === candidate)) ||
      (parent.type === 'SpreadElement' && parent.argument === candidate)
    ) {
      candidate = parent;
      parent = candidate.parent;
      continue;
    }
    return false;
  }
  return false;
};

const annotationOf = (param: ESTree.Node): ESTree.Node | null => {
  if (param.type === 'AssignmentPattern') return annotationOf(param.left);
  if (param.type === 'TSParameterProperty')
    return annotationOf(param.parameter);
  return 'typeAnnotation' in param ? (param.typeAnnotation ?? null) : null;
};

const inferCallbackParams = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow explicit parameter types in callback expressions',
    },
    schema: [],
    hasSuggestions: true,
    messages: {
      infer:
        "Move this type to the callback's contextual boundary and rely on parameter inference here.",
      inferSuggestion: 'Remove the explicit callback parameter type',
    },
  },
  create(context) {
    const check = (
      node: ESTree.ArrowFunctionExpression | ESTree.Function,
    ): void => {
      if (!isContextual(node)) return;
      for (const param of node.params) {
        const annotation = annotationOf(param);
        if (!annotation) continue;
        context.report({
          node: annotation,
          messageId: 'infer',
          suggest: [
            {
              messageId: 'inferSuggestion',
              fix: (fixer) => fixer.remove(annotation),
            },
          ],
        });
      }
    };
    return {
      ArrowFunctionExpression: check,
      FunctionExpression: check,
    };
  },
});

export { inferCallbackParams };
