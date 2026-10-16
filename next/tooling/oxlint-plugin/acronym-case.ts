import type { CreateRule, ESTree } from '@oxlint/plugins';

const CONSTANT = /^[A-Z0-9_]+$/;
/** Names the platform calls, so they can't be renamed. */
const PLATFORM = new Set(['toJSON']);

/**
 * Cases each run of capitals as a word: `TRPCError` → `TrpcError`,
 * `maxURLLength` → `maxUrlLength`, `toJSON` → `toJson`. A run followed by a
 * lowercase letter keeps its last capital, which starts the next word.
 */
export const suggest = (name: string): string =>
  name.replace(/[A-Z]{2,}/g, (run: string, offset: number) => {
    const next = name[offset + run.length];
    const word =
      next !== undefined && /[a-z]/.test(next) ? run.slice(0, -1) : run;
    return word[0] + word.slice(1).toLowerCase() + run.slice(word.length);
  });

/** The name to use instead, or `undefined` when `name` is fine. */
export const expected = (
  name: string,
  typeParameter = false,
): string | undefined => {
  if (CONSTANT.test(name) || PLATFORM.has(name)) return undefined;
  const fixed =
    typeParameter && /^T[A-Z]/.test(name)
      ? `T${suggest(name.slice(1))}`
      : suggest(name);
  return fixed === name ? undefined : fixed;
};

const rule: CreateRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Case acronyms as words in declared names (`TrpcError`, not `TRPCError`)',
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
        message: `Case acronyms as words: \`${fixed}\`, not \`${node.name}\`.`,
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
};

export default rule;
