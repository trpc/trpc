'use client';

import { useSubscription } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { useTRPC } from '~/trpc/client';

export function RandomNumber() {
  const trpc = useTRPC();
  const [messages, setMessages] = useState<number[]>([]);

  const randomNumberSub = useSubscription(
    trpc.randomNumber.subscriptionOptions(undefined, {
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
    }),
  );

  return (
    <>
      <p className="font-mono text-2xl text-indigo-400">
        {typeof randomNumberSub.data === 'number'
          ? randomNumberSub.data.toFixed(6)
          : 'Waiting for data...'}
      </p>
      <p className="text-xs text-gray-500">
        Status: {randomNumberSub.status}
        {randomNumberSub.error && ` | Error: ${randomNumberSub.error.message}`}
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
    </>
  );
}
