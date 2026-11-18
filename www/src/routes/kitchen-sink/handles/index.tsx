import { dehydrate, HydrationBoundary, isServer } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ensureEntry,
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { z } from 'zod';

import { pageHead } from '~/seo.ts';
import { site } from '~/site.ts';

import { showcases } from '../-showcases.ts';
import { Comments } from './-components/comments.tsx';
import { Note, SeeItYourself } from './-components/note.tsx';
import { Post } from './-components/post.tsx';
import { postNumbers } from './-posts.ts';
import { loaderTRPC, useRequestCount } from './-trpc.ts';

const [showcase] = showcases;

/** `?post=2`. Without it, or with a post that doesn't exist, the first post. */
const searchSchema = z.object({
  post: z
    .number()
    .int()
    .refine((post) => postNumbers.includes(post))
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute('/kitchen-sink/handles/')({
  head: () => pageHead({ ...showcase, noindex: true }),
  // The post comes from the URL, so the loader can start its queries.
  validateSearch: searchSchema,
  loaderDeps: (opts) => ({ post: String(opts.search.post ?? 1) }),
  loader: async (opts) => {
    const { queryClient, trpc } = loaderTRPC();
    const [handles] = await loadHandles(trpc, {
      // The page waits for the post…
      post: ensureEntry(trpc.post.byId, { id: opts.deps.post }),
      // …and not for its comments, which stream in.
      comments: prefetchEntry(trpc.post.comments, { postId: opts.deps.post }),
    });
    return {
      // On the server, the queries go to the browser with the page. In the
      // browser, they're already in its query client.
      dehydrated: isServer ? dehydrate(queryClient) : null,
      handles,
    };
  },
  component: HandlesPage,
});

/**
 * The commit this build is from, so the links show the code that runs. It
 * changes this route's own chunk on each deploy, and no other.
 */
const source = `${site.github}/blob/${__TRPC_SENTRY_RELEASE__ || 'main'}/www/src/routes/kitchen-sink/handles`;

function HandlesPage() {
  const data = Route.useLoaderData();
  const requests = useRequestCount();
  return (
    <HydrationBoundary state={data.dehydrated}>
      <h1 className="text-4xl font-extrabold tracking-tight">
        {showcase.title}
      </h1>
      <p className="text-muted-foreground">
        Before sending this page, the server loaded the post and started its
        comments with <code>loadHandles</code>. The parts below read those
        queries with <code>fromHandle</code>, by a handle: the query's name and
        input, without its data. Your browser gets the data with the page, so it
        doesn't fetch it again.{' '}
        <a className="underline" href={`${source}/index.tsx`}>
          How it works
        </a>{' '}
        ·{' '}
        <a className="underline" href={`${source}/-server/router.ts`}>
          The router
        </a>
      </p>
      <SeeItYourself>
        <p>
          Open your browser's Network tab and reload. The post and its comments
          are in the page, and the counter below stays at 0: nothing was fetched
          again.
        </p>
        <p>
          Then pick another post. The loader runs in your browser this time, and
          gets the post and its comments in one request:{' '}
          <code>post.byId,post.comments</code>.
        </p>
        <p>
          “Refetch the post” reads the same handle, and asks for{' '}
          <code>post.byId</code> alone.
        </p>
      </SeeItYourself>
      <p
        className="rounded-md border px-3 py-2 text-sm"
        data-testid="request-count"
      >
        Requests from this tab to the tRPC endpoint: <strong>{requests}</strong>
      </p>
      <nav aria-label="Posts" className="flex flex-wrap gap-2 text-sm">
        {postNumbers.map((id) => (
          <Link
            className="rounded-md border px-3 py-1 hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-semibold"
            key={id}
            // The click loads the post, not hovering, so the counter is
            // easy to follow.
            preload={false}
            // Switching posts keeps the page where it is.
            resetScroll={false}
            search={{ post: id === 1 ? undefined : id }}
            to="/kitchen-sink/handles"
          >
            Post {id}
          </Link>
        ))}
      </nav>
      <section className="grid gap-2">
        <Note label="ensureEntry · waited for">
          The page waited for <code>post.byId</code>, so the post was in the
          HTML the server sent.
        </Note>
        <Post post={data.handles.post} />
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Comments</h2>
        <Note label="prefetchEntry · not waited for">
          The loader started <code>post.comments</code> with the post but didn't
          wait for it. The comments stream in as they load.
        </Note>
        <Suspense
          fallback={
            <Note label="Suspense">
              Waiting for <code>post.comments</code>, which the loader started
              with the post.
            </Note>
          }
        >
          <Comments comments={data.handles.comments} />
        </Suspense>
      </section>
    </HydrationBoundary>
  );
}
