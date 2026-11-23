'use client';

import { useQuery } from '@tanstack/react-query';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function HealthCheck(props: {
  healthcheck: inferQueryHandle<TRPC['healthcheck']>;
}) {
  const trpc = useTRPC();
  const healthQuery = useQuery(fromHandle(trpc, props.healthcheck));

  return (
    <p className="font-mono text-green-400">
      {healthQuery.data ?? 'Loading...'}
    </p>
  );
}
