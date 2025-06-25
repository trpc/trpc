'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useTRPC } from '../trpc/client';

export function Content() {
  const trpc = useTRPC();

  const options = trpc.greeting.queryOptions();
  const result = useSuspenseQuery(options);

  return <div>{result.data.text}</div>;
}
