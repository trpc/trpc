'use client';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@shared/ui/components/item';
import { Skeleton } from '@shared/ui/components/skeleton';
import { Spinner } from '@shared/ui/components/spinner';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { ChevronRightIcon, CircleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import type { RouterOutput, TRPC } from '~/trpc/client';
import { useTRPC } from '~/trpc/client';

type Post = RouterOutput['post']['list']['items'][number];

function formatDate(date: Date) {
  return date.toLocaleDateString('en-us', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
}

function PostItem(props: { post: Post }) {
  const { post } = props;
  return (
    <Item variant="outline" render={<Link href={`/post/${post.id}`} />}>
      <ItemContent>
        <ItemTitle>{post.title}</ItemTitle>
        <ItemDescription>{post.text}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <time
          dateTime={post.createdAt.toISOString()}
          className="text-xs text-muted-foreground"
        >
          {formatDate(post.createdAt)}
        </time>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

export function PostsCard(props: {
  posts: inferInfiniteQueryHandle<TRPC['post']['list']>;
}) {
  const trpc = useTRPC();
  // `page.tsx` loaded the first page on the server, so this renders it at once
  const postsQuery = useInfiniteQuery(
    fromHandle(trpc, props.posts, {
      getNextPageParam(lastPage) {
        return lastPage.nextCursor;
      },
    }),
  );

  // prefetch all posts for instant navigation
  // const queryClient = useQueryClient();
  // useEffect(() => {
  //   const allPosts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  //   for (const { id } of allPosts) {
  //     void queryClient.prefetchQuery(trpc.post.byId.queryOptions({ id }));
  //   }
  // }, [postsQuery.data, queryClient, trpc]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest posts</CardTitle>
        <CardDescription>
          <code>post.list</code> with <code>useInfiniteQuery</code>, five posts
          a page
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(() => {
          switch (postsQuery.status) {
            case 'pending':
              return (
                <ItemGroup className="gap-2">
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </ItemGroup>
              );
            case 'error':
              return (
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>Couldn't load posts</AlertTitle>
                  <AlertDescription>
                    {postsQuery.error.message}
                  </AlertDescription>
                  <AlertAction>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => postsQuery.refetch()}
                    >
                      Try again
                    </Button>
                  </AlertAction>
                </Alert>
              );
            case 'success':
              return (
                <ItemGroup className="gap-2">
                  {postsQuery.data.pages.flatMap((page) =>
                    page.items.map((post) => (
                      <PostItem key={post.id} post={post} />
                    )),
                  )}
                </ItemGroup>
              );
          }
        })()}
      </CardContent>
      {postsQuery.status === 'success' && (
        <CardFooter className="justify-center">
          {(() => {
            switch (postsQuery.fetchStatus) {
              case 'fetching':
                return (
                  <Button variant="outline" disabled>
                    <Spinner />
                    Loading…
                  </Button>
                );
              case 'paused':
                return (
                  <Button variant="outline" disabled>
                    Waiting for network…
                  </Button>
                );
              case 'idle':
                return postsQuery.hasNextPage ? (
                  <Button
                    variant="outline"
                    onClick={() => postsQuery.fetchNextPage()}
                  >
                    Load more
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    That's every post
                  </p>
                );
            }
          })()}
        </CardFooter>
      )}
    </Card>
  );
}
