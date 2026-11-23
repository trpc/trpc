import {
  ensureEntry,
  isTRPCEntryError,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HydrateClient, trpc } from '~/trpc/server';
import { PostView } from './post-view';

type PostPageProps = { params: Promise<{ id: string }> };

/**
 * Waits for the post, and shows the 404 page if there's none.
 * `generateMetadata` and the page share the request's query client, so the
 * post loads once.
 * @see https://trpc.io/docs/v11/client/tanstack-react-query/handles#errors-ensure
 */
function loadPost(id: string) {
  return loadHandles(trpc, {
    post: ensureEntry(trpc.post.byId, { id }),
  }).catch((error: unknown) => {
    if (isTRPCEntryError(error, trpc.post.byId) && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  });
}

export async function generateMetadata(
  props: PostPageProps,
): Promise<Metadata> {
  const { id } = await props.params;
  const [, data] = await loadPost(id);
  return { title: `${data.post.title} · Prisma Starter` };
}

export default async function PostPage(props: PostPageProps) {
  const { id } = await props.params;
  const [handles] = await loadPost(id);

  return (
    <HydrateClient>
      <PostView post={handles.post} />
    </HydrateClient>
  );
}
