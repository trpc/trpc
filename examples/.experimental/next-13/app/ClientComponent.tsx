'use client';

import { Suspense, cache, use, useState } from 'react';
import { trpc } from 'trpc';

const helloQuery = cache((v: string) =>
  trpc.hello.query({
    name: v,
  }),
);

export function ClientComponent() {
  const [input, setInput] = useState('');
  const data = helloQuery(input);
  return (
    <div>
      <input
        type=""
        onChange={(e) => setInput(e.currentTarget.value)}
        value={input}
      />

      <br />
      <Suspense>
        In client: <pre>{JSON.stringify(use(data), null, 4)}</pre>
      </Suspense>
    </div>
  );
}
