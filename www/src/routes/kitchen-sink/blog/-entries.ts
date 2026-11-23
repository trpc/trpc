/**
 * Every query each page of the blog needs, from the URL alone. The loaders
 * wait for none of them: each part of a page shows when its query has
 * loaded.
 */
import {
  experimental_dataOf,
  experimental_perItem,
  type experimental_inferHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
  type TRPCLoadEntries,
} from '@trpc/tanstack-react-query/unstable-handles';

import type { TRPC } from './-trpc.ts';

/** The post list, with an author for every post */
export function postListEntries(trpc: TRPC) {
  const posts = prefetchInfiniteEntry(
    trpc.blog.posts,
    { limit: 10 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  return {
    posts,
    // An author for every post. The authors' ids are in the posts, which
    // haven't loaded yet, so the callback runs once on a stand-in for every
    // post. The server runs `blog.authorById` for every post it found, in the
    // same request: for this first page, and for each page the list loads later
    authors: experimental_perItem(
      experimental_dataOf(posts).pages.flatMap((page) => page.items),
      (post) => prefetchEntry(trpc.blog.authorById, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}

/** What the list's loader gives its components */
export type PostListHandles = experimental_inferHandles<typeof postListEntries>;

/** A post, its author, and what else the author's team wrote */
export function postPageEntries(trpc: TRPC, opts: { readonly slug: string }) {
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
    // A second step: the list is filtered by the author's team, and only the
    // author has its id. Post, author and the list's first page are one
    // request. Later pages are requests of their own.
    //
    // The input has nothing of this post in it, so the list is one query for
    // all of the team's posts: going from one to the next finds it in the
    // cache. The card leaves the open post out when it reads the list
    moreFromTeam: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(
        trpc.blog.posts,
        { teamId: it.teamId, limit: 5 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor },
      ),
    ),
  } satisfies TRPCLoadEntries;
}

/** What the post page's loader gives its components */
export type PostPageHandles = experimental_inferHandles<typeof postPageEntries>;
