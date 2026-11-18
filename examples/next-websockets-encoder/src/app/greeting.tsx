'use client';

import { useQuery } from '@tanstack/react-query';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useState } from 'react';
import { useTRPC, type TRPC } from '~/trpc/client';

export function Greeting(props: { greet: inferQueryHandle<TRPC['greet']> }) {
  const trpc = useTRPC();
  // the name changes as you type, so start from the handle's input; while
  // it matches, the query reads what the page loaded
  const [name, setName] = useState(props.greet.input.name);
  const greetQuery = useQuery(
    trpc.greet.queryOptions({ ...props.greet.input, name }),
  );

  return (
    <>
      <div className="flex gap-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="flex-1 rounded bg-gray-700 px-4 py-2 text-white outline-hidden focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <p className="font-mono text-blue-400">
        {greetQuery.data ?? 'Loading...'}
      </p>
    </>
  );
}
