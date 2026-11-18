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
  experimental_entryPerItem,
  fromHandle,
  experimental_handleOfItem,
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
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
import { DevNote, DevNoteText } from './-components/dev-note';
import { OneRequestHint } from './-components/one-request-hint';
import { useBlogPreload } from './-components/settings';

/** Every query the list needs. The loader waits for none of them */
function postListEntries(trpc: TRPC) {
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
    authors: experimental_entryPerItem(
      experimental_dataOf(posts).pages.flatMap((page) => page.items),
      (post) => prefetchEntry(trpc.blog.authorById, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}

export const Route = createFileRoute('/blog/')({
  loader: async (opts) => {
    const { trpc } = opts.context;
    const [handles] = await loadHandles(trpc, postListEntries(trpc));
    return { handles };
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
        <OneRequestHint>
          Turn “Preload links” off and reload this page: a link that preloads
          may have loaded a post already. Then open your browser’s Network tab,
          and open a post you haven’t opened yet. The post, its author and the
          posts of the author’s team each need the one before. They still load
          in one request:{' '}
          <code>blog.postBySlug,blog.authorById,blog.posts</code>. So does this
          list, with an author for every post.
        </OneRequestHint>
      </section>
      <Suspense
        fallback={
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground [&_code]:font-mono">
              <span className="font-medium">Suspense: </span>
              waiting for <code>blog.posts</code>. The loader started it, and an
              author for every post it has, in one request.
            </p>
            {Array.from({ length: 10 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        }
      >
        <PostList handles={loaderData.handles} />
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
  const preload = useBlogPreload();
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
            key={post.slug}
            variant="outline"
            className="relative transition-colors hover:bg-muted has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50"
          >
            <ItemContent>
              <ItemTitle>
                <Link
                  to="/blog/$slug"
                  params={{ slug: post.slug }}
                  preload={preload}
                  className="outline-none after:absolute after:inset-0"
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
