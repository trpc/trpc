'use client';

import { use } from 'react';
import { trpc } from '~/trpc';

export function ClientComponent() {
  const data = use(trpc.hello.query());
  return <p>In client: {data}</p>;
}
