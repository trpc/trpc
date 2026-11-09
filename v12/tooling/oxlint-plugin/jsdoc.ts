import { defineRule, type ESTree } from '@oxlint/plugins';

import { exportUse, packageUse } from './docs-use.ts';
import { packageName, packageRoot, publicNames } from './public-exports.ts';

const REQUIRED = ['@since', '@stability'] as const;

/**
 * Only experimental values carry a prefix. Unstable ones have their final
 * names until 12.0.0 (`.agent-docs/decisions/no-unstable-prefix.md`).
 */
const PREFIX = 'experimental_';
const UNSTABLE_PREFIX = 'unstable_';

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
        "`{{name}}` isn't experimental: export it as `{{next}}` and keep `{{name}}` as a `@deprecated` alias.",
      unstablePrefix:
        '`{{name}}`: no `unstable_` prefixes before 12.0.0, `@stability unstable` says it. Export it as `{{unprefixed}}`.',
      unstablePackage:
        '`{{name}}` is in an `unstable-` package. There are none: publish the package under its final name, its unstable exports tagged `@stability unstable`.',
      hiddenPackage:
        '`{{pkg}}` is used only on hidden docs pages (experiments: {{experiments}}), so it is experimental: name it `{{next}}`, with every export `@stability experimental`.',
      hidden:
        '`{{name}}` is documented only on hidden docs pages (experiments: {{experiments}}), so it is experimental: `@stability experimental`, named `experimental_{{name}}`.',
    },
  },
  create(context) {
    const reachable = publicNames(context.filename);
    const pkg = packageName(context.filename) ?? '';
    const root = packageRoot(context.filename);
    // The package name already says it: every export is experimental, unprefixed.
    const experimentalPackage = /^@[\w-]+\/experimental-/.test(pkg);
    // An unstable feature stays, so its package already has its final name.
    const unstablePackage = /^@[\w-]+\/unstable-/.test(pkg);
    // Docs pages in an experiment are hidden until a reader turns it on, so
    // what only they document isn't approved yet.
    const docs = root === undefined ? undefined : packageUse(root, pkg);
    const hiddenPackage =
      !experimentalPackage &&
      docs !== undefined &&
      !docs.listed &&
      docs.experiments.size > 0;
    let reportedPackage = false;
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
        const prefixed = name.startsWith(PREFIX);
        const unprefixed = prefixed ? name.slice(PREFIX.length) : name;
        if (unstablePackage) {
          context.report({
            node: declaration,
            messageId: 'unstablePackage',
            data: { name },
          });
          return;
        }
        if (name.startsWith(UNSTABLE_PREFIX)) {
          context.report({
            node: declaration,
            messageId: 'unstablePrefix',
            data: { name, unprefixed: name.slice(UNSTABLE_PREFIX.length) },
          });
          return;
        }
        if (hiddenPackage && !reportedPackage) {
          reportedPackage = true;
          context.report({
            node: declaration,
            messageId: 'hiddenPackage',
            data: {
              pkg,
              experiments: [...(docs?.experiments ?? [])].join(', '),
              next: pkg.replace(/^(@[\w-]+\/)/, '$1experimental-'),
            },
          });
        }
        if (experimentalPackage) {
          if (stability !== 'experimental') {
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
        const documented =
          root === undefined ? undefined : exportUse(root, pkg, name);
        if (
          stability !== 'experimental' &&
          !deprecated &&
          documented !== undefined &&
          !documented.listed &&
          documented.experiments.size > 0
        ) {
          context.report({
            node: declaration,
            messageId: 'hidden',
            data: {
              name: unprefixed,
              experiments: [...documented.experiments].join(', '),
            },
          });
          return;
        }
        const experimental = stability === 'experimental';
        if (experimental && !prefixed && !deprecated) {
          context.report({
            node: declaration,
            messageId: 'prefix',
            data: { name: unprefixed },
          });
        } else if (prefixed && !experimental && !deprecated) {
          context.report({
            node: declaration,
            messageId: 'promoted',
            data: { name, next: unprefixed },
          });
        }
      },
    };
  },
});

export { jsdoc };
