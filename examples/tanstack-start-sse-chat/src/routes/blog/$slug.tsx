import { buttonVariants } from '@shared/ui/components/button';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import {
  experimental_dataOf,
  ensureEntry,
  fromHandle,
  loadHandlesSettled,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  inferQueryHandle,
  TRPCLoadEntries,
} from '@trpc/tanstack-react-query/unstable-handles';
import { format } from 'date-fns';
import { ArrowLeftIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';
import { AuthorCard, authorCardEntries } from './-components/author-card';

/** Every query the post page needs, from the URL alone */
function postPageEntries(trpc: TRPC, opts: { slug: string }) {
  const post = ensureEntry(trpc.blog.postBySlug, { slug: opts.slug });
  return {
    post,
    // The author's id is in the post, which hasn't loaded yet. `experimental_dataOf()` stands
    // in for it, and the server reads it from the post in the same request
    authorCard: authorCardEntries(trpc, {
      authorId: experimental_dataOf(post).authorId,
      exceptSlug: opts.slug,
    }),
  } satisfies TRPCLoadEntries;
}

export const Route = createFileRoute('/blog/$slug')({
  loader: async (opts) => {
    const { trpc } = opts.context;
    const [handles, results] = await loadHandlesSettled(
      trpc,
      postPageEntries(trpc, { slug: opts.params.slug }),
    );
    if (results.post.status === 'error') {
      if (results.post.error.code === 'NOT_FOUND') {
        // oxlint-disable-next-line typescript/only-throw-error -- the router's not-found signal
        throw notFound();
      }
      throw results.post.error;
    }
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
