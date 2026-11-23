/**
 * This is a Next.js page, a server component.
 */
import {
  ensureEntry,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { HydrateClient, trpc } from '~/trpc/server';
import { Greeting } from './greeting';

export default async function IndexPage() {
  // Starts the query on the server; the page waits for it
  const [handles] = await loadHandles(trpc, {
    greeting: ensureEntry(trpc.greeting, { name: 'client' }),
  });

  return (
    <HydrateClient>
      <div style={styles}>
        {/* Shown if the cache loses the data, e.g. after `resetQueries()` */}
        <Suspense fallback={<h1>Loading...</h1>}>
          <Greeting greeting={handles.greeting} />
        </Suspense>
      </div>
    </HydrateClient>
  );
}

const styles = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};
