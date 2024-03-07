'use client';

import { trpc } from '~/trpc/react';

export function WaitCard(props: { ms: number }) {
  const [data] = trpc.wait.useSuspenseQuery({ ms: props.ms });
  return <div>{data}</div>;
}
