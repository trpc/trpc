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
} from '@tanstack/react-router';
import {
  fromHandle,
  type inferQueryHandle,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import { ArrowLeftIcon } from 'lucide-react';
import { Suspense } from 'react';

import { AuthorCard } from './-components/author-card.tsx';
import { DevFallback, DevNote, SeeItYourself } from './-components/note.tsx';
import { useBlogPreload } from './-components/settings.tsx';
import { formatDate } from './-date.ts';
import { postPageEntries } from './-entries.ts';
import { isNotFound, loaderTRPC, type TRPC, useTRPC } from './-trpc.ts';

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
      <Suspense
        fallback={
          <DevFallback className="h-40 w-full">
            waiting for <code>blog.postBySlug</code>. The loader started it from
            the URL, and didn’t wait for it.
          </DevFallback>
        }
      >
        <Post post={data.handles.post} />
      </Suspense>
      <Suspense
        fallback={
          <DevFallback className="h-48 w-full">
            waiting for the post, then <code>blog.authorById</code>. The
            author’s id is in the post: the server reads it there, in the same
            request.
          </DevFallback>
        }
      >
        <AuthorCard handles={data.handles} />
      </Suspense>
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

function AllPostsLink() {
  const preload = useBlogPreload();
  return (
    <Link
      className={buttonVariants({
        className: 'self-start justify-self-start',
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

function Post(props: {
  readonly post: inferQueryHandle<TRPC['blog']['postBySlug']>;
}) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  const post = postQuery.data;
  return (
    <article className="flex flex-col gap-4">
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
    </article>
  );
}
