import { HydrationBoundary, prefetch, trpc } from '../trpc/server.ts';
import { Chat } from './chat.tsx';
import { Files } from './files.tsx';
import { Posts } from './posts.tsx';

export const dynamic = 'force-dynamic';

export default function Page() {
  // Started on the server, streamed to the browser's cache.
  prefetch(trpc.post.list.queryOptions());
  return (
    <main>
      <h1>tRPC v12 + Next.js</h1>
      <HydrationBoundary>
        <Posts />
      </HydrationBoundary>
      <Chat />
      <Files />
    </main>
  );
}
