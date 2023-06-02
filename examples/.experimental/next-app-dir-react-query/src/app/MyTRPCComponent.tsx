'use client';

import { api } from '~/trpc/client';

export function MyTRPCComponent(props: { wait: number }) {
  const [data] = api.wait.useSuspenseQuery({ ms: props.wait });

  return <div>result: {data}</div>;
}
