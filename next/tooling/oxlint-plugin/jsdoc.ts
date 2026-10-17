import { defineRule, type ESTree } from '@oxlint/plugins';

import { packageName, publicNames } from './public-exports.ts';

const REQUIRED = ['@since', '@stability'] as const;

/** Declarations whose names carry the `experimental_` prefix; types follow their value's. */
const VALUES = new Set([
  'FunctionDeclaration',
  'TSDeclareFunction',
  'ClassDeclaration',
  'VariableDeclaration',
]);

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

const jsdoc = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Require `@since` and `@stability` on exports reachable from a package's versioned entry points, and stability-consistent names",
    },
    schema: [],
    messages: {
      missing: '`{{name}}` is public but its JSDoc lacks {{missing}}.',
      replacement:
        '`{{name}}` is deprecated: say what replaces it, `@deprecated Use <name>`.',
      packageStability:
        '`{{name}}` is in an `experimental-` package, so it is `@stability experimental`.',
      packagePrefix:
        '`{{name}}` is in an `experimental-` package, which says it already: export it as `{{unprefixed}}`.',
      prefix:
        '`{{name}}` is experimental, so its name starts with `experimental_`: `experimental_{{name}}`.',
      promoted:
        "`{{name}}` isn't experimental: export it as `{{unprefixed}}` and keep `{{name}}` as a `@deprecated` alias.",
    },
  },
  create(context) {
    const reachable = publicNames(context.filename);
    // The package name already says it: every export is experimental, unprefixed.
    const experimentalPackage = /^@[\w-]+\/experimental-/.test(
      packageName(context.filename) ?? '',
    );
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
        // A decorated class's JSDoc sits above its first decorator.
        const first =
          declaration.type === 'ClassDeclaration' &&
          declaration.decorators[0] !== undefined &&
          declaration.decorators[0].range[0] < node.range[0]
            ? declaration.decorators[0]
            : node;
        const comments = context.sourceCode.getCommentsBefore(first);
        const doc = comments
          .filter((c) => c.type === 'Block' && c.value.startsWith('*'))
          .at(-1);
        const missing = REQUIRED.filter((tag) => !doc?.value.includes(tag));
        if (missing.length > 0) {
          context.report({
            node: declaration,
            messageId: 'missing',
            data: {
              name,
              missing: missing.map((t) => `\`${t}\``).join(' and '),
            },
          });
          return;
        }
        const text = doc!.value;
        const deprecated = /^\s*\*?\s*@deprecated\b/m.test(text);
        if (deprecated && !/@deprecated Use `?[\w$.]+`?/.test(text)) {
          context.report({
            node: declaration,
            messageId: 'replacement',
            data: { name },
          });
        }
        const experimental = /^\s*\*?\s*@stability experimental\b/m.test(text);
        const prefixed = name.startsWith('experimental_');
        const unprefixed = name.slice('experimental_'.length);
        if (experimentalPackage) {
          if (!experimental) {
            context.report({
              node: declaration,
              messageId: 'packageStability',
              data: { name },
            });
          } else if (prefixed) {
            context.report({
              node: declaration,
              messageId: 'packagePrefix',
              data: { name, unprefixed },
            });
          }
          return;
        }
        if (!VALUES.has(declaration.type)) return;
        if (experimental && !prefixed) {
          context.report({
            node: declaration,
            messageId: 'prefix',
            data: { name },
          });
        } else if (prefixed && !experimental && !deprecated) {
          context.report({
            node: declaration,
            messageId: 'promoted',
            data: { name, unprefixed },
          });
        }
      },
    };
  },
});

export { jsdoc };
