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
  fromHandle,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { format } from 'date-fns';
import { ArrowLeftIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';
import { AuthorCard } from './-components/author-card';
import { postPageEntries } from './-components/post-entries';

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
