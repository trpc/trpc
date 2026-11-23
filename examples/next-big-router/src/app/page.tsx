/**
 * This is a Next.js page, a server component. It starts the page's query
 * and passes its handle to the client component that reads it.
 */
import {
  ensureEntry,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { HydrateClient, trpc } from '~/trpc/server';
import { Greeting } from './greeting';
import { styles } from './styles';

// The server proxy's context reads `headers()`. Without this, `next build`
// tries to prerender the page, and `ensureEntry` rejects with a
// `TRPCEntryError` that wraps Next.js' dynamic-usage error, so Next.js
// fails the build instead of rendering the page on each request.
export const dynamic = 'force-dynamic';

export default async function IndexPage() {
  const [handles] = await loadHandles(trpc, {
    // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
    greeting: ensureEntry(trpc.router99.greeting, { who: 'KATT' }),
  });

  return (
    <HydrateClient>
      <Suspense
        fallback={
          <div style={styles}>
            <h1>Loading...</h1>
          </div>
        }
      >
        <Greeting greeting={handles.greeting} />
      </Suspense>
    </HydrateClient>
  );
}
