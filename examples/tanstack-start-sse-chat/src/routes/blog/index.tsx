import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@shared/ui/components/item';
import { Skeleton } from '@shared/ui/components/skeleton';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  experimental_dataOf,
  ensureInfiniteEntry,
  experimental_entryPerItem,
  fromHandle,
  experimental_handleOfItem,
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  experimental_inferHandles,
  inferQueryHandle,
  TRPCLoadEntries,
} from '@trpc/tanstack-react-query/unstable-handles';
import { format } from 'date-fns';
import { ChevronRightIcon } from 'lucide-react';
import { Suspense, useEffect, useRef } from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';

/** Every query the list needs */
function postListEntries(trpc: TRPC) {
  const posts = ensureInfiniteEntry(
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
    authors: experimental_entryPerItem(
      experimental_dataOf(posts).pages.map((page) => page.items),
      (post) => prefetchEntry(trpc.blog.authorById, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}

export const Route = createFileRoute('/blog/')({
  loader: async (opts) => {
    const { trpc } = opts.context;
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
        <h1 className="text-4xl font-bold tracking-tight">Blog</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Notes on databases, frontends and keeping things running.
        </p>
      </section>
      <Suspense
        fallback={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 10 }, (_, index) => (
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
  props: Readonly<{
    handles: experimental_inferHandles<typeof postListEntries>;
  }>,
) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.handles.posts, {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
  );
  const posts = postsQuery.data.pages.flatMap((page) => page.items);

  // Loads the next page when the end of the list scrolls into view
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = postsQuery;
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const end = endRef.current;
    if (!end || !hasNextPage || isFetchingNextPage) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void fetchNextPage();
      }
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      <ItemGroup>
        {posts.map((post) => (
          <Item
            key={post.slug}
            variant="outline"
            render={<Link to="/blog/$slug" params={{ slug: post.slug }} />}
          >
            <ItemContent>
              <ItemTitle>{post.title}</ItemTitle>
              <ItemDescription>
                <Suspense fallback="…">
                  {/* The post gives the handle of its author's query, also for
                      a post on a page that loaded after the loader ran */}
                  <AuthorName
                    author={experimental_handleOfItem(
                      props.handles.authors,
                      post,
                    )}
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
      <div ref={endRef} className="text-center text-sm text-muted-foreground">
        {hasNextPage ? 'Loading more…' : 'That’s all of them.'}
      </div>
    </>
  );
}

function AuthorName(
  props: Readonly<{ author: inferQueryHandle<TRPC['blog']['authorById']> }>,
) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.author));
  return authorQuery.data.name;
}
