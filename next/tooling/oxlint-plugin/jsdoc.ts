import type { CreateRule, ESTree } from '@oxlint/plugins';

import { publicNames } from './public-exports.ts';

const REQUIRED = ['@since', '@stability'] as const;

const declaredName = (node: ESTree.Node): string | undefined => {
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
    case 'ClassDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSEnumDeclaration':
      return node.id?.name;
    case 'VariableDeclaration': {
      const id = node.declarations[0]?.id;
      return id?.type === 'Identifier' ? id.name : undefined;
    }
    default:
      return undefined;
  }
};

const rule: CreateRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Exports reachable from a package's versioned entry points carry `@since` and `@stability` (proposal 21)",
    },
  },
  create(context) {
    const reachable = publicNames(context.filename);
    // Overloads share one JSDoc, on the first signature.
    const checked = new Set<string>();
    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (!declaration) return;
        const name = declaredName(declaration);
        if (name === undefined || !reachable.has(name) || checked.has(name))
          return;
        checked.add(name);
        const comments = context.sourceCode.getCommentsBefore(node);
        const doc = comments
          .filter((c) => c.type === 'Block' && c.value.startsWith('*'))
          .at(-1);
        const missing = REQUIRED.filter((tag) => !doc?.value.includes(tag));
        if (missing.length === 0) return;
        context.report({
          node: declaration,
          message: `\`${name}\` is public but its JSDoc lacks ${missing.map((t) => `\`${t}\``).join(' and ')}.`,
        });
      },
    };
  },
};

export default rule;
