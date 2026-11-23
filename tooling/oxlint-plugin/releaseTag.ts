import { basename } from 'node:path';
import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { topLevelDeclarations } from './declarations.ts';
import {
  internalDirectory,
  publicNames,
  type ReleaseTag,
} from './releaseTags.ts';

/** `doc` with `tag` added on its own line. */
const withTag = (doc: ESTree.Comment, tag: ReleaseTag): string =>
  doc.value.includes('\n')
    ? `/*${doc.value.trimEnd()}\n * @${tag}\n */`
    : `/**\n * ${doc.value.slice(1).trim()}\n * @${tag}\n */`;

/**
 * Every export says who it's for: `@public` for users, `@internal` for tRPC
 * itself, even when another tRPC package imports it or an entry point
 * exports it. The tag is a hint; nothing checks it against the entry
 * points. Public code doesn't live in an `internal(s)` folder or file.
 */
export const releaseTag = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require `@public` or `@internal` on exports, and keep `@public` out of internals',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missing:
        '`{{name}}` is exported, so its JSDoc says `@public` (for users) or `@internal` (for tRPC itself)',
      conflicting: '`{{name}}` is both `@public` and `@internal`',
      publicInInternals:
        '`{{name}}` is `@public`, but `{{path}}` is for internals: move it out, or tag it `@internal`',
    },
  },
  create(context) {
    const filename = context.filename;
    const internals = internalDirectory(filename);
    const reachable = publicNames(filename);

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
        const reported = new Set<ESTree.Node>();
        for (const d of declarations.values()) {
          const distinct = new Set(d.tags);
          if (distinct.size > 1) {
            context.report({
              node: d.node,
              messageId: 'conflicting',
              data: { name: d.name },
            });
          } else if (d.tags[0] === 'public' && internals !== null) {
            context.report({
              node: d.node,
              messageId: 'publicInInternals',
              data: {
                name: d.name,
                path:
                  internals === filename
                    ? basename(internals)
                    : `${basename(internals)}/`,
              },
            });
          } else if (distinct.size === 0 && d.exported) {
            // Several `const`s in one statement share a JSDoc.
            if (reported.has(d.statement)) continue;
            reported.add(d.statement);
            // A guess for the fix: what a versioned entry point exports from
            // outside internals is likely for users.
            const tag: ReleaseTag =
              reachable.has(d.name) && internals === null
                ? 'public'
                : 'internal';
            context.report({
              node: d.node,
              messageId: 'missing',
              data: { name: d.name },
              fix: (fixer) =>
                d.doc
                  ? fixer.replaceTextRange(d.doc.range, withTag(d.doc, tag))
                  : fixer.insertTextBefore(
                      above(d.statement),
                      `/** @${tag} */\n`,
                    ),
            });
          }
        }
      },
    };
  },
});
