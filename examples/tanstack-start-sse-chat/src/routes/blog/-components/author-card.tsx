import { Avatar, AvatarFallback } from '@shared/ui/components/avatar';
import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
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
import { DevFallback, DevNote } from './dev-note';
import { useBlogPreload } from './settings';

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
            <CardTitle className="flex flex-wrap items-center gap-2">
              {author.name}
              <DevNote label="step 2 · server-side waterfall">
                <p>
                  <code>
                    blog.authorById({'{'} id: post.authorId {'}'})
                  </code>
                  . The author’s id is in the post, so this query has to wait
                  for the post: a waterfall.
                </p>
                <p>
                  The waterfall ran on the server. The post’s request had this
                  call in it too, and the server filled in the id from the post.
                  The browser made no request of its own for it.
                </p>
              </DevNote>
            </CardTitle>
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
        <Suspense
          fallback={
            <DevFallback className="h-28 w-full">
              waiting for <code>blog.posts</code>. Its team id is in the author:
              the server fills it in, in the same request.
            </DevFallback>
          }
        >
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
  const preload = useBlogPreload();
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
      <DevNote label="step 3 · blog.posts">
        <p>
          <code>
            blog.posts({'{'} teamId: author.teamId, limit: 5 {'}'})
          </code>
          . The team’s id is in the author, which is in the post: the
          waterfall’s second step, on the server too, in the same request.
        </p>
        <p>
          <span className="font-medium">Show more</span> is a request of its
          own: a later page reads nothing it has to wait for.
        </p>
      </DevNote>
      <ul className="flex flex-col gap-2 text-sm">
        {morePosts.map((post) => (
          <li key={post.slug}>
            <Link
              to="/blog/$slug"
              params={{ slug: post.slug }}
              preload={preload}
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
