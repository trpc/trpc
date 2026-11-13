import { Badge } from '@shared/ui/components/badge';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@shared/ui/components/item';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  fromHandle,
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { format } from 'date-fns';
import { ChevronRightIcon } from 'lucide-react';
import { Suspense } from 'react';
import { startRequestLog } from '~/lib/blog-demo';
import { useTRPC, type TRPC } from '~/lib/trpc';

export const Route = createFileRoute('/blog/')({
  loader: async (opts) => {
    const { trpc } = opts.context;
    startRequestLog();
    const [handles] = await loadHandles(trpc, {
      posts: prefetchEntry(trpc.blog.posts),
    });
    return handles;
  },
  component: BlogIndex,
});

function BlogIndex() {
  const loaderData = Route.useLoaderData();
  return (
    <>
      <section className="flex flex-col items-start gap-4">
        <Badge variant="secondary">Pipelining</Badge>
        <h1 className="text-4xl font-bold tracking-tight">A fake blog</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          A post page needs the post and its author, and the author&apos;s id is
          in the post. With pipelining, both load in one request.
        </p>
      </section>
      <Suspense
        fallback={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        }
      >
        <PostList posts={loaderData.posts} />
      </Suspense>
    </>
  );
}

function PostList(
  props: Readonly<{ posts: inferQueryHandle<TRPC['blog']['posts']> }>,
) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseQuery(fromHandle(trpc, props.posts));
  return (
    <ItemGroup>
      {postsQuery.data.map((post) => (
        <Item
          key={post.slug}
          variant="outline"
          // Without preloading on hover, the click is what loads the page
          render={
            <Link
              to="/blog/$slug"
              params={{ slug: post.slug }}
              preload={false}
            />
          }
        >
          <ItemContent>
            <ItemTitle>{post.title}</ItemTitle>
            <ItemDescription>
              {format(post.publishedAt, 'd MMMM yyyy')}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
