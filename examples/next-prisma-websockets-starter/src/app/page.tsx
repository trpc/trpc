import {
  ensureInfiniteEntry,
  loadHandlesSettled,
} from '@trpc/tanstack-react-query/unstable-handles';
import { HydrateClient, trpc } from '~/trpc/server';
import { Chat } from './chat';

export default async function IndexPage() {
  /**
   * Waits for the first page of messages, so it's in the first HTML. If it
   * fails, the page still renders, and the list shows the error with a retry
   * button.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-as-values
   */
  const [handles] = await loadHandlesSettled(trpc, {
    posts: ensureInfiniteEntry(
      trpc.post.infinite,
      {},
      { getNextPageParam: (d) => d.nextCursor },
    ),
  });

  return (
    <HydrateClient>
      <Chat posts={handles.posts} />
    </HydrateClient>
  );
}
