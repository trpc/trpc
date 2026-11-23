import { fileURLToPath } from 'node:url';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import { docPages } from '../../build/content.ts';
import { fromDocusaurus } from '../../build/docusaurus-syntax.ts';
import { headingsOf } from '../../build/markdown.ts';
import { samplesDir } from '../../build/paths.ts';
import { v11 } from '../site.ts';
import { searchDocs } from './search.ts';
import type { DocMeta } from './types.ts';

const contentDir = fileURLToPath(new URL('../../v11/docs', import.meta.url));

// The API reference is generated before a build, so only the guides are
// here, as the sidebar lists them with no experiment on.
const v11Guides = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pages = yield* docPages({
    basePath: v11.basePath,
    contentDir,
    firstDoc: v11.firstDoc,
    samplesDir,
  });
  return yield* Effect.forEach(
    pages.filter(
      (page) =>
        !page.slug.startsWith('typedoc/') && page.experiment === undefined,
    ),
    (page) =>
      fs.readFileString(path.join(contentDir, `${page.slug}.md`)).pipe(
        Effect.flatMap((raw) =>
          headingsOf(
            fromDocusaurus(raw.replace(/^---\n[\s\S]*?\n---\n/, ''), true)
              .markdown,
          ),
        ),
        Effect.map((headings): DocMeta => ({
          description: page.description,
          headings,
          label: page.label,
          parent: page.parent,
          section: page.section,
          slug: page.slug,
          title: page.title,
        })),
      ),
  );
}).pipe(Effect.provide(NodeServices.layer));

const ranking = [
  ['handle', 'client/tanstack-react-query/handles'],
  ['handles', 'client/tanstack-react-query/handles'],
  ['batching', 'client/links/httpBatchLink'],
  ['subscriptions', 'server/subscriptions'],
  ['subscription', 'server/subscriptions'],
  ['useQuery', 'client/react/useQuery'],
  ['queryOptions', 'client/tanstack-react-query/usage#queryOptions'],
  ['httpBatchLink', 'client/links/httpBatchLink'],
  ['error handling', 'server/error-handling'],
  ['middleware', 'server/middlewares'],
  ['context', 'server/context'],
  ['websockets', 'server/websockets'],
  ['server actions', 'client/nextjs/server-actions'],
  ['infinite query', 'client/react/useInfiniteQuery'],
  ['transformer', 'server/data-transformers'],
  ['sse', 'client/links/httpSubscriptionLink#sse-options-on-the-server'],
  ['adapters', 'server/adapters'],
  ['cors', 'client/cors'],
] as const;

const docs = await Effect.runPromise(v11Guides);

describe('searchDocs on the v11 guides', () => {
  it.each(ranking)('ranks %s first as %s', (query, expected) => {
    const top = searchDocs(docs, query, 3).map((hit) => hit.entry.id);
    expect(top[0], `top 3: ${top.join(', ')}`).toBe(expected);
  });
});
