import { Avatar, AvatarFallback } from '@shared/ui/components/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Skeleton } from '@shared/ui/components/skeleton';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  experimental_dataOf,
  fromHandle,
  prefetchEntry,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  experimental_inferHandles,
  inferInfiniteQueryHandle,
  TRPCLoadEntries,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense, useEffect, useRef } from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';

/**
 * The queries this card needs. It takes an author's id as a string and
 * doesn't care where it comes from: the post page passes one that the server
 * fills in.
 */
export function authorCardEntries(
  trpc: TRPC,
  opts: { authorId: string; exceptSlug: string },
) {
  const author = prefetchEntry(trpc.blog.authorById, { id: opts.authorId });
  return {
    author,
    // A second step: the post list is filtered by the id of the author, who
    // is loaded with an id from the post. Post, author and the list's first
    // page are one request. Later pages are requests of their own
    moreByAuthor: prefetchInfiniteEntry(
      trpc.blog.posts,
      {
        authorId: experimental_dataOf(author).id,
        exceptSlug: opts.exceptSlug,
        limit: 5,
      },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    ),
  } satisfies TRPCLoadEntries;
}

export function AuthorCard(
  props: Readonly<{
    handles: experimental_inferHandles<typeof authorCardEntries>;
  }>,
) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.handles.author));
  const author = authorQuery.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{author.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <CardTitle>{author.name}</CardTitle>
            <CardDescription>{author.bio}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm font-medium">More by {author.name}</p>
        {/* The list loads after the author, whose id it needs, so it has a
            boundary of its own: the card shows without it */}
        <Suspense fallback={<Skeleton className="h-28 w-full" />}>
          <MoreByAuthor posts={props.handles.moreByAuthor} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

function MoreByAuthor(
  props: Readonly<{
    posts: inferInfiniteQueryHandle<TRPC['blog']['posts']>;
  }>,
) {
  const trpc = useTRPC();
  const moreQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.posts, {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
  );
  const morePosts = moreQuery.data.pages.flatMap((page) => page.items);

  // Loads the next page when the end of the list scrolls into view
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = moreQuery;
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const end = endRef.current;
    if (!end || !hasNextPage || isFetchingNextPage) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchNextPage();
        }
      },
      { root: listRef.current },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (morePosts.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing else yet.</p>;
  }
  return (
    // Shorter than a page of posts, so the next page loads on scroll
    <div
      ref={listRef}
      className="h-28 overflow-y-auto rounded-md border px-3 py-2"
    >
      <ul className="flex flex-col gap-2 text-sm">
        {morePosts.map((post) => (
          <li key={post.slug}>
            <Link
              to="/blog/$slug"
              params={{ slug: post.slug }}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
      <div ref={endRef} className="pt-2 text-xs text-muted-foreground">
        {hasNextPage ? 'Loading more…' : 'That’s all of them.'}
      </div>
    </div>
  );
}
