import {
  experimental_dataOf,
  prefetchEntry,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPCLoadEntries } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/lib/trpc';

/**
 * Every query the post page needs, from the URL alone. The loader waits for
 * none of them: each part of the page shows when its query has loaded.
 */
export function postPageEntries(trpc: TRPC, opts: { slug: string }) {
  const post = prefetchEntry(trpc.blog.postBySlug, { slug: opts.slug });
  // The author's id is in the post, which hasn't loaded yet. The callback
  // runs once, on a stand-in for the post, and the server reads the id from
  // the post in the same request
  const author = experimental_dataOf(post, (it) =>
    prefetchEntry(trpc.blog.authorById, { id: it.authorId }),
  );
  return {
    post,
    author,
    // A second step: the list is filtered by the id of the author, who is
    // loaded with an id from the post. Post, author and the list's first
    // page are one request. Later pages are requests of their own
    moreByAuthor: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(
        trpc.blog.posts,
        { authorId: it.id, exceptSlug: opts.slug, limit: 5 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor },
      ),
    ),
  } satisfies TRPCLoadEntries;
}
