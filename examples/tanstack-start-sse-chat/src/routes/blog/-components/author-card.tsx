import { Avatar, AvatarFallback } from '@shared/ui/components/avatar';
import { Button } from '@shared/ui/components/button';
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
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';
import type { PostPageHandles } from '../$slug';

/**
 * The author of a post, and what else their team wrote. The author's id is in
 * the post, and the team's id is in the author, so the card reads the post
 * first: the handles of its own queries are finished with the data they are
 * built from.
 */
export function AuthorCard(props: Readonly<{ handles: PostPageHandles }>) {
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
        <p className="mb-2 text-sm font-medium">
          More from the {author.teamId} team
        </p>
        {/* The list loads after the author, whose team it needs, so it has a
            boundary of its own: the card shows without it */}
        <Suspense fallback={<Skeleton className="h-28 w-full" />}>
          <MoreFromTeam
            posts={experimental_handleOfItem(handles.moreFromTeam, author)}
            exceptSlug={postQuery.data.slug}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
}

function MoreFromTeam(
  props: Readonly<{
    posts: inferInfiniteQueryHandle<TRPC['blog']['posts']>;
    /** The post the page shows, which the list leaves out */
    exceptSlug: string;
  }>,
) {
  const trpc = useTRPC();
  const moreQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.posts, {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      // The query is every post by the team, so all of the team's posts read
      // the same cache entry. Only what is shown leaves this post out
      select: (data) => ({
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.filter((post) => post.slug !== props.exceptSlug),
        })),
      }),
    }),
  );
  const morePosts = moreQuery.data.pages.flatMap((page) => page.items);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = moreQuery;

  if (morePosts.length === 0 && !hasNextPage) {
    return <p className="text-sm text-muted-foreground">Nothing else yet.</p>;
  }
  return (
    <div className="flex flex-col items-start gap-2">
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
      {/* A later page is a request of its own */}
      {hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Loading more…' : 'Show more'}
        </Button>
      ) : null}
    </div>
  );
}
