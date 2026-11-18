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

const sourceUrl = `${site.github}/tree/main/www/src/routes/kitchen-sink/handles`;

function HandlesPage() {
  const data = Route.useLoaderData();
  const requests = useRequestCount();
  return (
    <HydrationBoundary state={data.dehydrated}>
      <h1 className="text-4xl font-extrabold tracking-tight">
        {showcase.title}
      </h1>
      <p className="text-muted-foreground">{showcase.description}</p>
      <ul className="list-disc pl-5 text-sm">
        <li>
          The loader in <code>index.tsx</code> calls <code>loadHandles</code> on
          the server, against the router in <code>-server/router.ts</code>.
        </li>
        <li>
          The components in <code>-components/</code> read the queries with{' '}
          <code>fromHandle</code>.
        </li>
        <li>
          Opened from a link, the loader runs in the browser and calls the
          endpoint in <code>api.$.ts</code>.
        </li>
      </ul>
      <p
        className="rounded-md border px-3 py-2 text-sm"
        data-testid="request-count"
      >
        Requests this tab sent to the endpoint: <strong>{requests}</strong>
      </p>
      <nav aria-label="Posts" className="flex flex-wrap gap-2 text-sm">
        {postNumbers.map((id) => (
          <Link
            className="rounded-md border px-3 py-1 hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-semibold"
            key={id}
            search={{ post: id === 1 ? undefined : id }}
            to="/kitchen-sink/handles"
          >
            Post {id}
          </Link>
        ))}
      </nav>
      <Post post={data.handles.post} />
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Comments</h2>
        <Suspense fallback={<p>Loading comments…</p>}>
          <Comments comments={data.handles.comments} />
        </Suspense>
      </section>
      <p className="text-sm">
        <a className="underline" href={sourceUrl}>
          The source on GitHub
        </a>
      </p>
    </HydrationBoundary>
  );
}
