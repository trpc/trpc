import { dirname, relative } from 'node:path';
import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { topLevelDeclarations, typeReferences } from './declarations.ts';
import type { TopLevel } from './declarations.ts';
import {
  findDeclaration,
  publicNames,
  resolveImport,
  type ReleaseTag,
} from './releaseTags.ts';

/** `doc` with `tag` added on its own line, or replacing `replace`. */
const withTag = (
  doc: ESTree.Comment,
  tag: ReleaseTag,
  replace: ReleaseTag | null,
): string => {
  if (replace) {
    return `/*${doc.value.replace(new RegExp(`@${replace}\\b`), `@${tag}`)}*/`;
  }
  if (!doc.value.includes('\n')) {
    return `/**\n * ${doc.value.slice(1).trim()}\n * @${tag}\n */`;
  }
  return `/*${doc.value.trimEnd()}\n * @${tag}\n */`;
};

/**
 * Every export says whether it's public: `@public` if changing it needs a
 * major release, `@internal` if a minor may change it. What a package's
 * versioned entry points export is `@public`, and so is everything a
 * `@public` declaration's type refers to.
 */
export const releaseTag = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require `@public` or `@internal` on exports, consistent with what the entry points export',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missing:
        '`{{name}}` is exported, so its JSDoc says `@public` (changing it needs a major release) or `@internal` (a minor may change it)',
      conflicting: '`{{name}}` is both `@public` and `@internal`',
      reachable:
        "`{{name}}` is exported from a versioned entry point, so it's `@public`",
      leak: '`{{name}}` is `@public`, but its type uses `{{ref}}`, which is `@internal`{{where}}: make `{{ref}}` `@public`, or keep it out of the type',
    },
  },
  create(context) {
    const filename = context.filename;
    const reachable = publicNames(filename);

    /** The tag a declaration behaves as, `null` if it has none. */
    const effectiveTag = (d: TopLevel): ReleaseTag | null =>
      reachable.has(d.name) ? 'public' : (d.tags[0] ?? null);

    /**
     * Where a new JSDoc for `statement` goes: above the line comments right
     * before it, so `// oxlint-disable-next-line` still applies.
     */
    const above = (statement: ESTree.Node): ESTree.Node | ESTree.Comment => {
      const source = context.sourceCode.text;
      let anchor: ESTree.Node | ESTree.Comment = statement;
      for (const comment of context.sourceCode
        .getCommentsBefore(statement)
        .reverse()) {
        const gap = source.slice(comment.end, anchor.start);
        if (comment.type !== 'Line' || gap.split('\n').length > 2) break;
        anchor = comment;
      }
      return anchor;
    };

    return {
      Program(program) {
        const declarations = topLevelDeclarations(program, context.sourceCode);
        const imports = new Map<string, { from: string; name: string }>();
        for (const statement of program.body) {
          if (statement.type !== 'ImportDeclaration') continue;
          for (const specifier of statement.specifiers) {
            if (specifier.type !== 'ImportSpecifier') continue;
            const imported = specifier.imported;
            imports.set(specifier.local.name, {
              from: statement.source.value,
              name:
                imported.type === 'Identifier' ? imported.name : imported.value,
            });
          }
        }

        const reported = new Set<ESTree.Node>();
        for (const d of declarations.values()) {
          if (!d.exported) continue;
          const distinct = new Set(d.tags);
          if (distinct.size === 0) {
            // Several `const`s in one statement share a JSDoc.
            if (reported.has(d.statement)) continue;
            reported.add(d.statement);
            const tag: ReleaseTag = reachable.has(d.name)
              ? 'public'
              : 'internal';
            context.report({
              node: d.node,
              messageId: 'missing',
              data: { name: d.name },
              fix: (fixer) =>
                d.doc
                  ? fixer.replaceTextRange(
                      d.doc.range,
                      withTag(d.doc, tag, null),
                    )
                  : fixer.insertTextBefore(
                      above(d.statement),
                      `/** @${tag} */\n`,
                    ),
            });
          } else if (distinct.size > 1) {
            context.report({
              node: d.node,
              messageId: 'conflicting',
              data: { name: d.name },
            });
          } else if (
            d.tags[0] === 'internal' &&
            reachable.has(d.name) &&
            d.doc
          ) {
            const doc = d.doc;
            context.report({
              node: d.node,
              messageId: 'reachable',
              data: { name: d.name },
              fix: (fixer) =>
                fixer.replaceTextRange(
                  doc.range,
                  withTag(doc, 'public', 'internal'),
                ),
            });
          }
        }

        /** The tag `name` behaves as where it's declared, and where that is. */
        const tagOf = (
          name: string,
        ): { tag: ReleaseTag | null; file: string } | undefined => {
          const local = declarations.get(name);
          if (local) return { tag: effectiveTag(local), file: filename };
          const imported = imports.get(name);
          const target = imported && resolveImport(filename, imported.from);
          const found = target && findDeclaration(target, imported.name);
          if (!found) return undefined;
          return {
            tag: publicNames(found.file).has(found.name)
              ? 'public'
              : (found.tags[0] ?? null),
            file: found.file,
          };
        };

        for (const root of declarations.values()) {
          if (!root.exported || effectiveTag(root) !== 'public') continue;
          // Non-exported declarations the type uses are part of it too.
          const visited = new Set([root.name]);
          const queue = [...root.declarations];
          const leaked = new Set<string>();
          for (let next = queue.pop(); next; next = queue.pop()) {
            for (const ref of typeReferences(next)) {
              const local = declarations.get(ref.name);
              // Untagged local declarations are part of the type; a local
              // one tagged `@internal` is a leak like an exported one.
              if (
                local &&
                !local.exported &&
                !local.tags.includes('internal')
              ) {
                if (!visited.has(ref.name)) {
                  visited.add(ref.name);
                  queue.push(...local.declarations);
                }
                continue;
              }
              const target = tagOf(ref.name);
              if (target?.tag !== 'internal' || leaked.has(ref.name)) continue;
              leaked.add(ref.name);
              context.report({
                node: ref.node,
                messageId: 'leak',
                data: {
                  name: root.name,
                  ref: ref.name,
                  where:
                    target.file === filename
                      ? ''
                      : ` in \`${relative(dirname(filename), target.file)}\``,
                },
              });
            }
          }
        }
      },
    };
  },
});
