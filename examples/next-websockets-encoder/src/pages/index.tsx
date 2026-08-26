import { trpc } from '~/utils/trpc';
import Head from 'next/head';
import { useState } from 'react';

export default function IndexPage() {
  const [name, setName] = useState('world');
  const [messages, setMessages] = useState<number[]>([]);

  const greetQuery = trpc.greet.useQuery({ name });
  const healthQuery = trpc.healthcheck.useQuery();
  const randomNumberSub = trpc.randomNumber.useSubscription(undefined, {
    onData: (data) => {
      console.log('onData received:', data, typeof data);
      setMessages((prev) => [...prev.slice(-9), data]);
    },
    onStarted: () => {
      console.log('Subscription started!');
    },
    onError: (err) => {
      console.error('Subscription error:', err);
    },
  });

  return (
    <>
      <Head>
        <title>tRPC WebSocket + MessagePack Encoder</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
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
            <p className="font-mono text-green-400">
              {healthQuery.data ?? 'Loading...'}
            </p>
          </section>

          <section className="space-y-4 rounded-lg bg-gray-800 p-6">
            <h2 className="text-xl font-semibold">Greeting (HTTP)</h2>
            <div className="flex gap-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="flex-1 rounded bg-gray-700 px-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <p className="font-mono text-blue-400">
              {greetQuery.data ?? 'Loading...'}
            </p>
          </section>

          <section className="space-y-4 rounded-lg bg-gray-800 p-6">
            <h2 className="text-xl font-semibold">
              Random Number Subscription (WebSocket + MessagePack)
            </h2>
            <p className="text-sm text-gray-400">
              Open DevTools → Network → WS to see binary frames
            </p>
            <p className="font-mono text-2xl text-indigo-400">
              {typeof randomNumberSub.data === 'number'
                ? randomNumberSub.data.toFixed(6)
                : 'Waiting for data...'}
            </p>
            <p className="text-xs text-gray-500">
              Status: {randomNumberSub.status}
              {randomNumberSub.error &&
                ` | Error: ${randomNumberSub.error.message}`}
            </p>
            <p className="font-mono text-xs text-gray-400">
              Raw data: {JSON.stringify(randomNumberSub.data)}
            </p>

            {messages.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs text-gray-500">
                  Recent messages ({messages.length}):
                </p>
                <div className="max-h-32 overflow-y-auto rounded bg-gray-900 p-2 font-mono text-xs text-gray-400">
                  {messages.map((msg, i) => (
                    <div key={i}>{msg.toFixed(8)}</div>
                  ))}
                </div>
              </div>
            )}
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
    </>
  );
}
