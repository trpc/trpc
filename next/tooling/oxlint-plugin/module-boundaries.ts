import { posix } from 'node:path';
import { defineRule, type ESTree } from '@oxlint/plugins';

/**
 * Each folder directly under a configured root (`packages/trpc/src/server`)
 * is a module. Code outside a module imports it only through its `index.ts`,
 * so the files beside it stay private; code inside imports its siblings
 * directly, never its own `index.ts`, which would make a cycle through the
 * barrel. Loose files in a root aren't modules, nor are folders named in
 * `ignore` (test `fixtures`).
 */

interface Options {
  readonly roots: ReadonlyArray<string>;
  readonly ignore?: ReadonlyArray<string>;
}

const toPosix = (file: string) => file.replaceAll('\\', '/');

/** The module folder a file sits in, if any. */
const moduleOf = (
  file: string,
  roots: ReadonlyArray<string>,
  ignore: ReadonlyArray<string>,
): string | undefined => {
  for (const root of roots) {
    const marker = `/${root}/`;
    const at = file.lastIndexOf(marker);
    if (at === -1) continue;
    const start = at + marker.length;
    const slash = file.indexOf('/', start);
    if (slash === -1) continue;
    if (ignore.includes(file.slice(start, slash))) return undefined;
    return file.slice(0, slash);
  }
  return undefined;
};

const moduleBoundaries = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        "Import another module only through its index.ts, and a module's own files directly",
    },
    schema: [
      {
        type: 'object',
        properties: {
          roots: { type: 'array', items: { type: 'string' } },
          ignore: { type: 'array', items: { type: 'string' } },
        },
        required: ['roots'],
        additionalProperties: false,
      },
    ],
    messages: {
      deep: "'{{specifier}}' reaches into the {{module}} module; import its index.ts instead.",
      ownIndex:
        "'{{specifier}}' is this file's own module's index.ts; import the file beside it instead.",
    },
  },
  create(context) {
    const options = context.options[0] as Options | undefined;
    const roots = options?.roots ?? [];
    const ignore = options?.ignore ?? [];
    const filename = toPosix(context.filename);
    const own = moduleOf(filename, roots, ignore);

    const check = (source: ESTree.Node | null | undefined) => {
      if (
        source?.type !== 'Literal' ||
        typeof source.value !== 'string' ||
        !source.value.startsWith('.')
      ) {
        return;
      }
      const specifier = source.value;
      const target = posix.normalize(
        posix.join(posix.dirname(filename), specifier),
      );
      const module = moduleOf(target, roots, ignore);
      if (module === undefined) return;
      const isIndex = target === `${module}/index.ts`;
      if (module === own) {
        if (isIndex) {
          context.report({
            node: source,
            messageId: 'ownIndex',
            data: { specifier },
          });
        }
      } else if (!isIndex) {
        context.report({
          node: source,
          messageId: 'deep',
          data: { specifier, module: posix.basename(module) },
        });
      }
    };

    return {
      ImportDeclaration(node) {
        check(node.source);
      },
      ExportNamedDeclaration(node) {
        check(node.source);
      },
      ExportAllDeclaration(node) {
        check(node.source);
      },
      ImportExpression(node) {
        check(node.source);
      },
    };
  },
});

export { moduleBoundaries };
