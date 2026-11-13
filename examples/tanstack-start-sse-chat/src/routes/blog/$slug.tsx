import { buttonVariants } from '@shared/ui/components/button';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import {
  dataOf,
  fetchEntry,
  fromHandle,
  isTRPCEntryError,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { format } from 'date-fns';
import { ArrowLeftIcon } from 'lucide-react';
import { Suspense } from 'react';
import { startRequestLog } from '~/lib/blog-demo';
import { useTRPC, type TRPC } from '~/lib/trpc';
import { AuthorCard, authorCardEntries } from './-components/author-card';

/** Every query the post page needs, from the URL alone */
function postPageEntries(trpc: TRPC, opts: { slug: string }) {
  // `staleTime: 0` so every visit shows its requests in the log
  const post = fetchEntry(
    trpc.blog.postBySlug,
    { slug: opts.slug },
    { staleTime: 0 },
  );
  return {
    post,
    // The author's id is in the post, which hasn't loaded yet. `dataOf()` stands
    // in for it. With pipelining, the server reads it from the post and runs
    // these queries in the same request. Without, the browser waits for the post
    authorCard: authorCardEntries(trpc, {
      authorId: dataOf(post).authorId,
      exceptSlug: opts.slug,
    }),
  };
}

export const Route = createFileRoute('/blog/$slug')({
  loader: async (opts) => {
    const { trpc } = opts.context;
    startRequestLog();
    const [handles] = await loadHandles(
      trpc,
      postPageEntries(trpc, { slug: opts.params.slug }),
    ).catch((error: unknown) => {
      if (
        isTRPCEntryError(error, trpc.blog.postBySlug) &&
        error.code === 'NOT_FOUND'
      ) {
        // oxlint-disable-next-line typescript/only-throw-error -- the router's not-found signal
        throw notFound();
      }
      throw error;
    });
    return handles;
  },
  component: PostPage,
});

function PostPage() {
  const loaderData = Route.useLoaderData();
  return (
    <>
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
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Post post={loaderData.post} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <AuthorCard handles={loaderData.authorCard} />
      </Suspense>
    </>
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
