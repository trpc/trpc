import {
  ensureEntry,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import { HydrateClient, trpc } from '~/trpc/server';
import { Greeting } from './greeting';
import { HealthCheck } from './health-check';
import { RandomNumber } from './random-number';

export default async function IndexPage() {
  // wait for both queries, so they're in the first HTML
  const [handles] = await loadHandles(trpc, {
    healthcheck: ensureEntry(trpc.healthcheck),
    greet: ensureEntry(trpc.greet, { name: 'world' }),
  });

  return (
    <HydrateClient>
      <div className="min-h-screen bg-gray-900 p-8 text-white">
        <div className="mx-auto max-w-2xl space-y-8">
          <header>
            <h1 className="text-3xl font-bold">
              tRPC WebSocket + MessagePack Encoder
            </h1>
            <p className="mt-2 text-gray-400">
              This example demonstrates using MessagePack binary serialization
              over WebSocket connections for improved performance.
            </p>
          </header>

          <section className="space-y-4 rounded-lg bg-gray-800 p-6">
            <h2 className="text-xl font-semibold">Health Check (HTTP)</h2>
            <HealthCheck healthcheck={handles.healthcheck} />
          </section>

          <section className="space-y-4 rounded-lg bg-gray-800 p-6">
            <h2 className="text-xl font-semibold">Greeting (HTTP)</h2>
            <Greeting greet={handles.greet} />
          </section>

          <section className="space-y-4 rounded-lg bg-gray-800 p-6">
            <h2 className="text-xl font-semibold">
              Random Number Subscription (WebSocket + MessagePack)
            </h2>
            <p className="text-sm text-gray-400">
              Open DevTools → Network → WS to see binary frames
            </p>
            <RandomNumber />
          </section>

          <footer className="text-center text-sm text-gray-500">
            <p>
              Messages are serialized using{' '}
              <code className="rounded bg-gray-800 px-2 py-1">
                @msgpack/msgpack
              </code>
            </p>
          </footer>
        </div>
      </div>
    </HydrateClient>
  );
}
