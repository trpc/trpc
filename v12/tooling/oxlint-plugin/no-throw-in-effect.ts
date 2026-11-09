import { defineRule, type ESTree } from '@oxlint/plugins';

/**
 * No `throw` in Effect code: an `Effect.gen`/`Effect.fn` body, or a callback
 * handed straight to an `Effect.*` or `Stream.*` combinator. Effect turns the
 * throw into a defect, so a failure meant to be typed reaches the client as a
 * masked `INTERNAL_SERVER_ERROR`. Fail with `yield* error`/`Effect.fail`, or
 * `Effect.die` for a bug.
 *
 * `Effect.try` and `Effect.tryPromise` take code that throws on purpose; their
 * options are object literals, so their callbacks are never direct arguments.
 */

const EFFECT_MODULES = new Set(['Effect', 'Stream']);
const GENERATOR_CALLEES = new Set(['gen', 'fn', 'fnUntraced']);

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

const isFunction = (node: ESTree.Node): node is FunctionNode =>
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'FunctionExpression' ||
  node.type === 'FunctionDeclaration';

/** `gen` for `Effect.gen`, also through `Effect.fn('name')(…)`. */
const effectMember = (callee: ESTree.Node): string | undefined => {
  if (callee.type === 'CallExpression') return effectMember(callee.callee);
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    EFFECT_MODULES.has(callee.object.name) &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return undefined;
};

const nearestFunction = (node: ESTree.Node): FunctionNode | undefined => {
  for (let at = node.parent; at; at = at.parent) {
    if (isFunction(at)) return at;
  }
  return undefined;
};

const inEffect = (fn: FunctionNode): boolean => {
  const call = fn.parent;
  if (call?.type !== 'CallExpression') return false;
  if (!call.arguments.includes(fn as ESTree.Expression)) return false;
  const member = effectMember(call.callee);
  if (member === undefined) return false;
  if (fn.generator) return GENERATOR_CALLEES.has(member);
  return true;
};

const noThrowInEffect = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `throw` in Effect generators and Effect/Stream callbacks',
    },
    schema: [],
    messages: {
      banned:
        'A `throw` in Effect code becomes a defect, so the failure loses its type. Fail with `yield* err` / `Effect.fail(err)` for an expected failure, or `Effect.die(err)` for a bug.',
    },
  },
  create(context) {
    return {
      ThrowStatement(node) {
        const fn = nearestFunction(node);
        if (fn && inEffect(fn)) context.report({ node, messageId: 'banned' });
      },
    };
  },
});

export { noThrowInEffect };
