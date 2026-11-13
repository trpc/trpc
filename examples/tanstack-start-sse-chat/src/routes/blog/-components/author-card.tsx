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
  experimental_handleOfItem,
  fromHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  experimental_inferHandles,
  inferInfiniteQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense, useEffect, useRef } from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';
import type { postPageEntries } from './post-entries';

/**
 * The author of a post, and what else they wrote. The author's id is in the
 * post, so the card reads the post first: the handles of its own queries are
 * finished with the data they are built from.
 */
export function AuthorCard(
  props: Readonly<{
    handles: experimental_inferHandles<typeof postPageEntries>;
  }>,
) {
  const trpc = useTRPC();
  const { handles } = props;
  const postQuery = useSuspenseQuery(fromHandle(trpc, handles.post));
  const authorQuery = useSuspenseQuery(
    fromHandle(trpc, experimental_handleOfItem(handles.author, postQuery.data)),
  );
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
          <MoreByAuthor
            posts={experimental_handleOfItem(handles.moreByAuthor, author)}
          />
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
