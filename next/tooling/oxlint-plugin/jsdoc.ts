import { defineRule, type ESTree } from '@oxlint/plugins';

import { packageName, publicNames } from './public-exports.ts';

const REQUIRED = ['@since', '@stability'] as const;

/** The stages before stable, each with its name prefix: `experimental_`, then `unstable_`. */
const STAGES = ['experimental', 'unstable'] as const;

/** Declarations whose names carry the stage prefix (`experimental_`, `unstable_`); types follow their value's. */
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
        '`{{name}}` is {{stage}}, so its name starts with `{{stage}}_`: `{{stage}}_{{name}}`.',
      promoted:
        "`{{name}}` isn't {{stage}}: export it as {{next}} and keep `{{name}}` as a `@deprecated` alias.",
      unstablePackage:
        '`{{name}}` is in an `unstable-` package. There are none: publish the package under its final name, with its unstable exports named `unstable_*`.',
    },
  },
  create(context) {
    const reachable = publicNames(context.filename);
    const pkg = packageName(context.filename) ?? '';
    // The package name already says it: every export is experimental, unprefixed.
    const experimentalPackage = /^@[\w-]+\/experimental-/.test(pkg);
    // An unstable feature stays, so its package already has its final name.
    const unstablePackage = /^@[\w-]+\/unstable-/.test(pkg);
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
        const stability = /^\s*\*?\s*@stability (\w+)/m.exec(text)?.[1];
        const prefix = STAGES.find((stage) => name.startsWith(`${stage}_`));
        const unprefixed =
          prefix === undefined ? name : name.slice(prefix.length + 1);
        if (unstablePackage) {
          context.report({
            node: declaration,
            messageId: 'unstablePackage',
            data: { name },
          });
          return;
        }
        if (experimentalPackage) {
          if (stability !== 'experimental') {
            context.report({
              node: declaration,
              messageId: 'packageStability',
              data: { name },
            });
          } else if (prefix !== undefined) {
            context.report({
              node: declaration,
              messageId: 'packagePrefix',
              data: { name, unprefixed },
            });
          }
          return;
        }
        if (!VALUES.has(declaration.type)) return;
        const stage = STAGES.find((each) => each === stability);
        if (stage !== undefined && prefix !== stage && !deprecated) {
          context.report({
            node: declaration,
            messageId: 'prefix',
            data: { name: unprefixed, stage },
          });
        } else if (prefix !== undefined && prefix !== stage && !deprecated) {
          context.report({
            node: declaration,
            messageId: 'promoted',
            data: {
              name,
              next:
                prefix === 'experimental'
                  ? `\`unstable_${unprefixed}\` or \`${unprefixed}\``
                  : `\`${unprefixed}\``,
              stage: prefix,
            },
          });
        }
      },
    };
  },
});

export { jsdoc };
