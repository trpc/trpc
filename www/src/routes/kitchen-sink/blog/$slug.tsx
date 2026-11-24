import { buttonVariants } from '@shared/ui/components/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@shared/ui/components/empty';
import { HydrationBoundary, useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router';
import {
  experimental_dataOf,
  type experimental_inferHandles,
  fromHandle,
  type inferQueryHandle,
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
  type TRPCLoadEntries,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Skeleton } from '@shared/ui/components/skeleton';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { Suspense, useEffect } from 'react';

import { AuthorCard } from './-components/author-card.tsx';
import { DevNote, noteTextClass, SeeItYourself } from './-components/note.tsx';
import { useBlogPreload } from './-components/settings.tsx';
import { formatDate } from './-date.ts';
import { usePageLink, usePostLink } from './-links.ts';
import { isNotFound, loaderTRPC, type TRPC, useTRPC } from './-trpc.ts';

/**
 * Every query the post's page needs, from the URL alone: a post, its author,
 * and what else the author's team wrote. The loader waits for none of them:
 * each part of the page shows when its query has loaded.
 */
function postPageEntries(trpc: TRPC, opts: { readonly slug: string }) {
  const post = prefetchEntry(trpc.blog.postBySlug, { slug: opts.slug });
  // The author's id is in the post, which hasn't loaded yet. The callback
  // runs once, on a stand-in for the post, and the server reads the id from
  // the post in the same request
  const author = experimental_dataOf(post, (it) =>
    prefetchEntry(trpc.blog.authorById, { id: it.authorId }),
  );
  return {
    post,
    author,
    // A second step: the list is filtered by the author's team, and only the
    // author has its id. Post, author and the list's first page are one
    // request. Later pages are requests of their own.
    //
    // The input has nothing of this post in it, so the list is one query for
    // all of the team's posts: going from one to the next finds it in the
    // cache. The card leaves the open post out when it reads the list
    moreFromTeam: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(
        trpc.blog.posts,
        { teamId: it.teamId, limit: 5 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor },
      ),
    ),
  } satisfies TRPCLoadEntries;
}

/** What the post page's loader gives its components */
export type PostPageHandles = experimental_inferHandles<typeof postPageEntries>;

export const Route = createFileRoute('/kitchen-sink/blog/$slug')({
  loader: async (opts) => {
    const { dehydrated, queryClient, trpc } = loaderTRPC();
    const { slug } = opts.params;
    // Every entry is a prefetch entry, so this starts the queries and returns
    const [handles] = await loadHandles(trpc, postPageEntries(trpc, { slug }));
    const state = await dehydrated();
    // On the server, `dehydrated()` waited for the post, so a post that isn't
    // there is a 404 before the page renders.
    const post = queryClient.getQueryState(
      trpc.blog.postBySlug.queryKey({ slug }),
    );
    if (state !== null && isNotFound(post?.error)) {
      throw notFound();
    }
    return { dehydrated: state, handles };
  },
  component: PostPage,
  errorComponent: PostError,
  notFoundComponent: NoPost,
});

function PostPage() {
  const data = Route.useLoaderData();
  return (
    <HydrationBoundary state={data.dehydrated}>
      <AllPostsLink />
      <Suspense fallback={<PostSkeleton />}>
        <Post post={data.handles.post} />
      </Suspense>
      <Suspense fallback={<AuthorCardSkeleton />}>
        <AuthorCard handles={data.handles} />
      </Suspense>
      <SeeItYourself>
        <p>
          With the Network tab open, go to a post you haven’t opened yet. Its
          author’s id is in the post, and the id of the author’s team is in the
          author. All three are one request:{' '}
          <code>blog.postBySlug,blog.authorById,blog.posts</code>.
        </p>
        <p>
          Reload instead, and the server calls the router itself and sends the
          data with the page: the meter shows no request.
        </p>
      </SeeItYourself>
    </HydrationBoundary>
  );
}

/**
 * In the browser, the loader doesn't wait for the post: a post that isn't
 * there fails where it is read, and ends up here
 */
function PostError(props: ErrorComponentProps) {
  if (!isNotFound(props.error)) {
    throw props.error;
  }
  return <NoPost />;
}

function NoPost() {
  return (
    <>
      <AllPostsLink />
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>There is no post at this address.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}

/** Back to the list: on a narrow screen, the post is on a page by itself */
function AllPostsLink() {
  const preload = useBlogPreload();
  const pageLink = usePageLink();
  return (
    <Link
      {...pageLink}
      className={buttonVariants({
        className: '-ml-2 self-start justify-self-start lg:hidden',
        size: 'sm',
        variant: 'ghost',
      })}
      preload={preload}
      to="/kitchen-sink/blog"
    >
      <ArrowLeftIcon />
      All posts
    </Link>
  );
}

/** The post while it loads: the same size as the post */
function PostSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-44 rounded-full" />
      <Skeleton className="h-9 w-4/5" />
      <Skeleton className="h-5 w-32" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
      <p className={noteTextClass}>
        <span className="font-medium">Suspense: </span>
        waiting for <code>blog.postBySlug</code>. The loader started it from the
        URL, and didn’t wait for it.
      </p>
    </div>
  );
}

function AuthorCardSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-48 w-full rounded-xl" />
      <p className={noteTextClass}>
        <span className="font-medium">Suspense: </span>
        waiting for the post, then <code>blog.authorById</code>. The author’s id
        is in the post: the server reads it there, in the same request.
      </p>
    </div>
  );
}

function Post(props: {
  readonly post: inferQueryHandle<TRPC['blog']['postBySlug']>;
}) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  const post = postQuery.data;
  return (
    <article className="flex flex-col gap-4 motion-safe:animate-arrive">
      <DevNote label="step 1 · blog.postBySlug">
        <p>
          <code>
            blog.postBySlug({'{'} slug {'}'})
          </code>
          . Its input is in the URL, so the loader starts it at once, without
          waiting for it.
        </p>
        <p>
          It is the first call of the page’s one request:{' '}
          <code>blog.postBySlug,blog.authorById,blog.posts</code>. The other two
          need its data, and the server runs them as soon as it has it.
        </p>
      </DevNote>
      <h2 className="text-3xl font-bold tracking-tight">{post.title}</h2>
      <p className="text-sm text-muted-foreground">
        {formatDate(post.publishedAt)}
      </p>
      <p className="text-lg leading-relaxed">{post.body}</p>
      <PostNav newer={post.newer} older={post.older} />
    </article>
  );
}

interface PostLink {
  readonly slug: string;
  readonly title: string;
}

/**
 * The posts on either side of this one in the list, so you can keep
 * reading. ← and → go to them too, unless a field has the keyboard
 */
function PostNav(props: {
  readonly newer: PostLink | null;
  readonly older: PostLink | null;
}) {
  const { newer, older } = props;
  const preload = useBlogPreload();
  const postLink = usePostLink();
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        target?.closest('input, select, textarea, [contenteditable]')
      ) {
        return;
      }
      const to =
        event.key === 'ArrowLeft'
          ? newer
          : event.key === 'ArrowRight'
            ? older
            : null;
      if (to !== null) {
        event.preventDefault();
        void navigate({ ...postLink, params: { slug: to.slug } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newer, older, navigate, postLink]);
  return (
    <nav
      aria-label="More posts"
      className="mt-2 grid grid-cols-2 gap-2 border-t pt-4 text-sm"
    >
      {newer === null ? (
        <span />
      ) : (
        <Link
          {...postLink}
          className="group flex flex-col gap-0.5 rounded-lg p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-current"
          params={{ slug: newer.slug }}
          preload={preload}
        >
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeftIcon aria-hidden className="size-3" /> Newer
          </span>
          <span className="font-medium">{newer.title}</span>
        </Link>
      )}
      {older === null ? (
        <span />
      ) : (
        <Link
          {...postLink}
          className="group flex flex-col items-end gap-0.5 rounded-lg p-2 text-right hover:bg-muted focus-visible:outline-2 focus-visible:outline-current"
          params={{ slug: older.slug }}
          preload={preload}
        >
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Older <ArrowRightIcon aria-hidden className="size-3" />
          </span>
          <span className="font-medium">{older.title}</span>
        </Link>
      )}
    </nav>
  );
}
