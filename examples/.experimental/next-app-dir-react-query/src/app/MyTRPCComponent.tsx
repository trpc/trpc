'use client';

import { api } from '~/trpc/client';

export function MyTRPCComponent(props: {
  wait: number;
  revalidate?: number | false;
}) {
  const [data] = api.wait.useSuspenseQuery(
    { ms: props.wait },
    { trpc: { context: { revalidate: props.revalidate } } },
  );

  return <div>result: {data}</div>;
}
