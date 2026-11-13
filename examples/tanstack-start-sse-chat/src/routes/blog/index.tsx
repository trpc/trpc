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
  dataOf,
  fetchEntry,
  fromHandle,
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  inferHandles,
  inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { format } from 'date-fns';
import { ChevronRightIcon } from 'lucide-react';
import { Suspense } from 'react';
import { startRequestLog } from '~/lib/blog-demo';
import { useTRPC, type TRPC } from '~/lib/trpc';

/** Every query the list needs */
function postListEntries(trpc: TRPC) {
  // `staleTime: 0` so every visit shows its requests in the log
  const posts = fetchEntry(trpc.blog.posts, undefined, { staleTime: 0 });
  return {
    posts,
    // The authors' ids are in the posts, which haven't loaded yet. `.map()` reads
    // one from every post. With pipelining, the server collects them from the
    // posts and runs this query in the same request
    authors: prefetchEntry(
      trpc.blog.authorsByIds,
      { ids: dataOf(posts).map((post) => post.authorId) },
      { staleTime: 0 },
    ),
  };
}

export const Route = createFileRoute('/blog/')({
  loader: async (opts) => {
    const { trpc } = opts.context;
    startRequestLog();
    const [handles] = await loadHandles(trpc, postListEntries(trpc));
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
          Every page here needs posts and their authors, and the authors&apos;
          ids are in the posts. With pipelining, both load in one request.
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
        <PostList handles={loaderData} />
      </Suspense>
    </>
  );
}

function PostList(
  props: Readonly<{ handles: inferHandles<typeof postListEntries> }>,
) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseQuery(fromHandle(trpc, props.handles.posts));
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
              <Suspense fallback="…">
                <AuthorName
                  authors={props.handles.authors}
                  authorId={post.authorId}
                />
              </Suspense>
              {' · '}
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

function AuthorName(
  props: Readonly<{
    authors: inferQueryHandle<TRPC['blog']['authorsByIds']>;
    authorId: string;
  }>,
) {
  const trpc = useTRPC();
  const authorsQuery = useSuspenseQuery(fromHandle(trpc, props.authors));
  const author = authorsQuery.data.find((it) => it.id === props.authorId);
  return author?.name ?? 'Unknown author';
}
