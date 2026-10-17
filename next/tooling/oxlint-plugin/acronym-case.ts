import { defineRule, type ESTree } from '@oxlint/plugins';

/**
 * Identifiers we declare case each acronym as a word: `TrpcError`, not
 * `TRPCError`; `maxUrlLength`, not `maxURLLength`. Constants
 * (`SSE_EVENT`), platform names (`toJSON`) and a type parameter's `T` prefix
 * are left alone.
 */

const CONSTANT = /^[A-Z0-9_]+$/;
/** Names the platform calls, so they can't be renamed. */
const PLATFORM = new Set(['toJSON']);
/** The stability prefix, cased apart from the name it marks. */
const EXPERIMENTAL = 'experimental_';

/**
 * Cases each run of capitals as a word: `TRPCError` → `TrpcError`,
 * `maxURLLength` → `maxUrlLength`, `toJSON` → `toJson`. A run followed by a
 * lowercase letter keeps its last capital, which starts the next word.
 */
const suggest = (name: string): string =>
  name.replace(/[A-Z]{2,}/g, (run: string, offset: number) => {
    const next = name[offset + run.length];
    const word =
      next !== undefined && /[a-z]/.test(next) ? run.slice(0, -1) : run;
    return word[0] + word.slice(1).toLowerCase() + run.slice(word.length);
  });

/** The name to use instead, or `undefined` when `name` is fine. */
const expected = (name: string, typeParameter = false): string | undefined => {
  if (name.startsWith(EXPERIMENTAL)) {
    const fixed = expected(name.slice(EXPERIMENTAL.length), typeParameter);
    return fixed === undefined ? undefined : EXPERIMENTAL + fixed;
  }
  if (CONSTANT.test(name) || PLATFORM.has(name)) return undefined;
  const fixed =
    typeParameter && /^T[A-Z]/.test(name)
      ? `T${suggest(name.slice(1))}`
      : suggest(name);
  return fixed === name ? undefined : fixed;
};

const acronymCase = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require acronyms in declared names to be cased as words (`TrpcError`, not `TRPCError`)',
    },
    schema: [],
    messages: {
      acronym: 'Case acronyms as words: `{{fixed}}`, not `{{name}}`.',
    },
  },
  create(context) {
    const check = (
      node: ESTree.Node | null | undefined,
      typeParameter = false,
    ) => {
      if (node?.type !== 'Identifier') return;
      const fixed = expected(node.name, typeParameter);
      if (fixed === undefined) return;
      context.report({
        node,
        messageId: 'acronym',
        data: { fixed, name: node.name },
      });
    };
    const key = (node: { computed?: boolean; key: ESTree.Node }) => {
      if (!node.computed) check(node.key);
    };
    return {
      VariableDeclarator: (node) => check(node.id),
      FunctionDeclaration: (node) => check(node.id),
      ClassDeclaration: (node) => check(node.id),
      TSInterfaceDeclaration: (node) => check(node.id),
      TSTypeAliasDeclaration: (node) => check(node.id),
      TSEnumDeclaration: (node) => check(node.id),
      TSTypeParameter: (node) => check(node.name, true),
      MethodDefinition: (node) => key(node),
      PropertyDefinition: (node) => key(node),
      TSPropertySignature: (node) => key(node),
      TSMethodSignature: (node) => key(node),
    };
  },
});

export { acronymCase };
