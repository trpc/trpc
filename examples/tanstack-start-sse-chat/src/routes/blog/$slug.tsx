import { buttonVariants } from '@shared/ui/components/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@shared/ui/components/empty';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { isTRPCClientError } from '@trpc/client';
import {
  experimental_dataOf,
  fromHandle,
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
import { ArrowLeftIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';
import { AuthorCard } from './-components/author-card';
import { OneRequestHint } from './-components/one-request-hint';

/**
 * Every query the post page needs, from the URL alone. The loader waits for
 * none of them: each part of the page shows when its query has loaded.
 */
function postPageEntries(trpc: TRPC, opts: { slug: string }) {
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
    // A second step: the list is filtered by the id of the author, who is
    // loaded with an id from the post. Post, author and the list's first
    // page are one request. Later pages are requests of their own.
    //
    // The input has nothing of this post in it, so the list is one query for
    // all of the author's posts: going from one to the next finds it in the
    // cache. The card leaves the open post out when it reads the list
    moreByAuthor: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(
        trpc.blog.posts,
        { authorId: it.id, limit: 5 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor },
      ),
    ),
  } satisfies TRPCLoadEntries;
}

/** What the loader gives the page's components */
export type PostPageHandles = experimental_inferHandles<typeof postPageEntries>;

export const Route = createFileRoute('/blog/$slug')({
  loader: async (opts) => {
    const { trpc } = opts.context;
    // Every entry is a prefetch entry, so this starts the queries and returns
    const [handles] = await loadHandles(
      trpc,
      postPageEntries(trpc, { slug: opts.params.slug }),
    );
    return handles;
  },
  component: PostPage,
  errorComponent: PostError,
});

function PostPage() {
  const handles = Route.useLoaderData();
  return (
    <>
      <AllPostsLink />
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Post post={handles.post} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <AuthorCard handles={handles} />
      </Suspense>
      <OneRequestHint>
        With the Network tab open, go to another post. Its author’s id is in the
        post, and the list is filtered by the author. All three are one request:{' '}
        <code>blog.postBySlug,blog.authorById,blog.posts</code>.
      </OneRequestHint>
    </>
  );
}

/** A post that isn't there fails where it is read, and ends up here */
function PostError(props: ErrorComponentProps) {
  const { error } = props;
  if (!isTRPCClientError(error) || error.data?.code !== 'NOT_FOUND') {
    throw error;
  }
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

function AllPostsLink() {
  return (
    <Link
      to="/blog"
      className={buttonVariants({
        variant: 'ghost',
        size: 'sm',
        className: 'self-start',
      })}
    >
      <ArrowLeftIcon />
      All posts
    </Link>
  );
}

function Post(
  props: Readonly<{ post: inferQueryHandle<TRPC['blog']['postBySlug']> }>,
) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  const post = postQuery.data;
  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
      <p className="text-sm text-muted-foreground">
        {format(post.publishedAt, 'd MMMM yyyy')}
      </p>
      <p className="text-lg leading-relaxed">{post.body}</p>
    </article>
  );
}
