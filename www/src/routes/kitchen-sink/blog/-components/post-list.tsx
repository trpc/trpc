import { Button } from '@shared/ui/components/button';
import { Skeleton } from '@shared/ui/components/skeleton';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import {
  fromHandle,
  type inferInfiniteQueryHandle,
  type inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { type ReactNode, Suspense, useEffect, useRef } from 'react';

import { formatDate } from '../-date.ts';
import type { AppRouter } from '../-server/router.ts';
import { type TRPC, useTRPC } from '../-trpc.ts';
import { DevNote, DevNoteText } from './note.tsx';
import { usePostLink } from '../-links.ts';
import { loadsNextPageOnScroll } from '../-next-page.ts';
import { useBlogPreload } from './settings.tsx';

const rowClass =
  'relative flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50 has-[a[data-status=active]]:border-foreground/30 has-[a[data-status=active]]:bg-muted';

/** The list's rows while its first page loads: the same size as a row */
export function PostListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: 10 }, (_, index) => (
        <div className={rowClass} key={index}>
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

type ListedPost =
  inferRouterOutputs<AppRouter>['blog']['posts']['items'][number];

/**
 * Every post, newest first. Each row shows what `author` renders for its
 * post. Scrolling to its end loads the next page, in one request with what
 * the page loads for every post on it. The open post's row is highlighted.
 */
export function PostList(props: {
  readonly posts: inferInfiniteQueryHandle<TRPC['blog']['posts']>;
  readonly author: (post: ListedPost) => ReactNode;
}) {
  const trpc = useTRPC();
  const preload = useBlogPreload();
  const postLink = usePostLink();
  const postsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.posts, {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
  );
  const posts = postsQuery.data.pages.flatMap((page) => page.items);

  // Loads the next page when the end of the list scrolls into view
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
      !loadsNextPageOnScroll({
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
      })
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
    <div className="flex flex-col gap-2">
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
      <ul className="flex flex-col gap-2">
        {posts.map((post) => (
          // The link covers the row, under the author's note: a link can't
          // hold the note, which can be focused
          <li
            className={`${rowClass} motion-safe:animate-arrive`}
            key={post.slug}
          >
            <Link
              {...postLink}
              className="font-medium outline-none after:absolute after:inset-0"
              params={{ slug: post.slug }}
              preload={preload}
            >
              {post.title}
            </Link>
            <span className="text-muted-foreground">
              <span className="relative z-10">
                <Suspense
                  fallback={
                    <DevNoteText text="…">
                      <p>
                        <span className="font-medium">Suspense:</span> waiting
                        for this post’s run of <code>blog.authorById</code>, in
                        the list’s request.
                      </p>
                    </DevNoteText>
                  }
                >
                  {props.author(post)}
                </Suspense>
              </span>
              {' · '}
              {formatDate(post.publishedAt)}
            </span>
          </li>
        ))}
      </ul>
      <div
        className="py-2 text-center text-sm text-muted-foreground"
        ref={endRef}
      >
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
    </div>
  );
}

/** A post's author, by the handle of their query */
export function AuthorName(props: {
  readonly author: inferQueryHandle<TRPC['blog']['authorById']>;
}) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.author));
  return (
    <span className="inline-block motion-safe:animate-arrive">
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
    </span>
  );
}
