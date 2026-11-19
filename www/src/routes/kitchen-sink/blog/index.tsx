import { Button } from '@shared/ui/components/button';
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
  HydrationBoundary,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  experimental_handleOfItem,
  fromHandle,
  type inferQueryHandle,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import { ChevronRightIcon } from 'lucide-react';
import { Suspense, useEffect, useRef } from 'react';

import { DevNote, DevNoteText, SeeItYourself } from './-components/note.tsx';
import { useBlogPreload } from './-components/settings.tsx';
import { formatDate } from './-date.ts';
import { type PostListHandles, postListEntries } from './-entries.ts';
import { loaderTRPC, type TRPC, useTRPC } from './-trpc.ts';

export const Route = createFileRoute('/kitchen-sink/blog/')({
  loader: async () => {
    const { dehydrated, trpc } = loaderTRPC();
    const [handles] = await loadHandles(trpc, postListEntries(trpc));
    // On the server, the queries go to the browser with the page. In the
    // browser, they're already in its query client.
    return { dehydrated: await dehydrated(), handles };
  },
  component: BlogIndex,
});

function BlogIndex() {
  const data = Route.useLoaderData();
  return (
    <HydrationBoundary state={data.dehydrated}>
      <SeeItYourself>
        <p>
          Open your browser’s Network tab and open a post you haven’t opened
          yet. The post, its author and the posts of the author’s team each need
          the one before. They still load in one request:{' '}
          <code>blog.postBySlug,blog.authorById,blog.posts</code>. The meter
          above counts it.
        </p>
        <p>
          Come back here and scroll down: the next page of posts and an author
          for every post on it are one request too.
        </p>
        <p>
          Turn on “Slow queries” to watch each part arrive after the one before
          it, still in that one request. With “Preload links” on, a link may
          have loaded its post before you click.
        </p>
      </SeeItYourself>
      <Suspense
        fallback={
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground [&_code]:font-mono">
              <span className="font-medium">Suspense: </span>
              waiting for <code>blog.posts</code>. The loader started it, and an
              author for every post it has, in one request.
            </p>
            {Array.from({ length: 10 }, (_, index) => (
              <Skeleton className="h-14 w-full" key={index} />
            ))}
          </div>
        }
      >
        <PostList handles={data.handles} />
      </Suspense>
    </HydrationBoundary>
  );
}

function PostList(props: { readonly handles: PostListHandles }) {
  const trpc = useTRPC();
  const preload = useBlogPreload();
  const postsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.handles.posts, {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
  );
  const posts = postsQuery.data.pages.flatMap((page) => page.items);

  // Loads the next page when the end of the list scrolls into view. Not
  // after it failed: that waits for "Try again"
  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = postsQuery;
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const end = endRef.current;
    if (
      end === null ||
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError
    ) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void fetchNextPage();
      }
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  return (
    <>
      <DevNote label="1 request · an author for every post">
        <p>
          The list’s first page and an author for every post on it are one
          request: <code>blog.posts,blog.authorById</code>.
        </p>
        <p>
          <code>blog.authorById</code> is one call, with{' '}
          <code>
            each: {'{'} from: 0, path: ["items"] {'}'}
          </code>
          : the server runs it for every post it found, as soon as the page is
          there.
        </p>
        <p>
          Scrolling loads the next page and its authors in one request too.
          Hover an author for theirs.
        </p>
      </DevNote>
      <ItemGroup>
        {posts.map((post) => (
          // The link covers the row, under the author's note: a link can't
          // hold the note, which can be focused
          <Item
            className="relative transition-colors hover:bg-muted has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50"
            key={post.slug}
            variant="outline"
          >
            <ItemContent>
              <ItemTitle>
                <Link
                  className="outline-none after:absolute after:inset-0"
                  params={{ slug: post.slug }}
                  preload={preload}
                  to="/kitchen-sink/blog/$slug"
                >
                  {post.title}
                </Link>
              </ItemTitle>
              <ItemDescription>
                <span className="relative z-10">
                  <Suspense
                    fallback={
                      <DevNoteText text="…">
                        <p>
                          <span className="font-medium">Suspense:</span> waiting
                          for this post’s run of <code>blog.authorById</code>,
                          in the list’s request.
                        </p>
                      </DevNoteText>
                    }
                  >
                    {/* The post gives the handle of its author's query, also for
                      a post on a page that loaded after the loader ran */}
                    <AuthorName
                      author={experimental_handleOfItem(
                        props.handles.authors,
                        post,
                      )}
                    />
                  </Suspense>
                </span>
                {' · '}
                {formatDate(post.publishedAt)}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <div className="text-center text-sm text-muted-foreground" ref={endRef}>
        {isFetchNextPageError && !isFetchingNextPage ? (
          <span className="inline-flex items-center gap-2">
            The next page didn’t load.
            <Button
              size="sm"
              variant="outline"
              onClick={() => void fetchNextPage()}
            >
              Try again
            </Button>
          </span>
        ) : hasNextPage ? (
          'Loading more…'
        ) : (
          'That’s all of them.'
        )}
      </div>
    </>
  );
}

function AuthorName(props: {
  readonly author: inferQueryHandle<TRPC['blog']['authorById']>;
}) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.author));
  return (
    <DevNoteText text={authorQuery.data.name}>
      <p>
        <code>
          blog.authorById({'{'} id: post.authorId {'}'})
        </code>
        , for this post. Its id is in the post, so it waits for the list: a
        waterfall, which ran on the server.
      </p>
      <p>
        It is one run of a call for every post, in the list’s request: no
        request for each row. With <code>httpBatchStreamLink</code>, each run
        arrives by itself, as soon as it is ready.
      </p>
    </DevNoteText>
  );
}
