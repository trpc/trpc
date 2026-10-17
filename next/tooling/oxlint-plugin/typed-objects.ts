import { defineRule, type ESTree } from '@oxlint/plugins';

/**
 * An object literal kept in a variable and passed on is typed (`: T` or
 * `satisfies T`) or passed inline, so TypeScript checks it for excess
 * properties; that check only runs on a fresh literal. Points of truth are
 * exempt: exported, read by `typeof`, `as const`, mutated, or only read by
 * property, compared, or given to `expect`, `JSON.stringify` or
 * `Object.entries`/`keys`/`values` (directly or inside a literal). So are
 * objects that are only spreads.
 */

type Use = 'passed' | 'read' | 'truth';

const isExpect = (node: ESTree.Node): boolean => {
  if (node.type === 'CallExpression') return isExpect(node.callee);
  if (node.type === 'MemberExpression') return isExpect(node.object);
  return node.type === 'Identifier' && node.name === 'expect';
};

const UNTYPED = new Map([
  ['JSON', new Set(['stringify'])],
  ['Object', new Set(['entries', 'keys', 'values'])],
]);

/** Parameters typed `any` or `unknown`, where a fresh literal isn't checked either. */
const isUntypedSink = (callee: ESTree.Node): boolean =>
  isExpect(callee) ||
  (callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier' &&
    UNTYPED.get(callee.object.name)?.has(callee.property.name) === true);

/**
 * How one reference uses the object: passes it on whole, reads or writes a
 * property of it, or makes it the point of truth (`typeof x`, `export { x }`).
 * An object whose properties are written is state, so its own truth too.
 */
const useOf = (identifier: ESTree.Node): Use => {
  const parent = identifier.parent;
  if (!parent) return 'passed';
  if (parent.type === 'TSTypeQuery' || parent.type === 'ExportSpecifier') {
    return 'truth';
  }
  if (parent.type === 'BinaryExpression') return 'read';
  let node: ESTree.Node = identifier;
  let up: ESTree.Node | null = parent;
  while (
    up &&
    ((up.type === 'Property' && up.value === node) ||
      up.type === 'ObjectExpression' ||
      up.type === 'ArrayExpression' ||
      up.type === 'SpreadElement')
  ) {
    node = up;
    up = up.parent;
  }
  if (up?.type === 'CallExpression' && isUntypedSink(up.callee)) {
    return 'read';
  }
  if (
    parent.type === 'MemberExpression' &&
    parent.object === identifier &&
    parent.parent
  ) {
    const outer = parent.parent;
    const written =
      (outer.type === 'AssignmentExpression' && outer.left === parent) ||
      outer.type === 'UpdateExpression' ||
      (outer.type === 'UnaryExpression' && outer.operator === 'delete');
    return written ? 'truth' : 'read';
  }
  return 'passed';
};

const typedObjects = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require an object literal kept in a variable and passed on to be typed (`: T` or `satisfies T`) or passed inline',
    },
    schema: [],
    messages: {
      inline:
        "Pass `{{name}}` inline where it's used, or type it (`: T` or `satisfies T`) so excess properties are checked.",
      typed:
        'Type `{{name}}` (`: T` or `satisfies T`) so excess properties are checked, or pass it inline.',
    },
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || node.id.typeAnnotation) return;
        if (node.init?.type !== 'ObjectExpression') return;
        // Spread members are never checked for excess, so only own keys count.
        if (node.init.properties.every((p) => p.type === 'SpreadElement')) {
          return;
        }
        if (node.parent.parent?.type === 'ExportNamedDeclaration') return;
        const [variable] = context.sourceCode.getDeclaredVariables(node);
        if (!variable) return;
        const uses = variable.references
          .filter((ref) => !ref.init && !ref.isWrite())
          .map((ref) => useOf(ref.identifier));
        if (uses.includes('truth') || !uses.includes('passed')) return;
        context.report({
          node: node.id,
          messageId: uses.length === 1 ? 'inline' : 'typed',
          data: { name: node.id.name },
        });
      },
    };
  },
});

export { typedObjects };
