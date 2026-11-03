'use client';

import { Badge } from '@shared/ui/components/badge';
import { Button } from '@shared/ui/components/button';
import { Spinner } from '@shared/ui/components/spinner';
import type { TRPCSubscriptionResult } from '@trpc/tanstack-react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useTRPC } from '~/trpc/client';

function SubscriptionStatus(props: {
  subscription: TRPCSubscriptionResult<unknown, { message: string }>;
}) {
  const { subscription } = props;
  switch (subscription.status) {
    case 'idle':
      return <Badge variant="outline">idle</Badge>;
    case 'connecting':
      return (
        <Badge variant="secondary">
          <Spinner />
          connecting
        </Badge>
      );
    case 'pending':
      return <Badge>pending</Badge>;
    case 'error':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive">error</Badge>
          <span className="text-muted-foreground">
            {subscription.error.message}
          </span>
          <Button size="sm" variant="outline" onClick={subscription.reset}>
            Reset
          </Button>
        </div>
      );
  }
}

export function LoopData() {
  const trpc = useTRPC();
  const subscription = useSubscription(trpc.loopData.subscriptionOptions());
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
      <dt className="text-muted-foreground">Last data</dt>
      <dd className="font-mono">{subscription.data?.data ?? '–'}</dd>
      <dt className="text-muted-foreground">Last event ID</dt>
      <dd className="font-mono tabular-nums">{subscription.data?.id ?? '–'}</dd>
      <dt className="text-muted-foreground">Status</dt>
      <dd>
        <SubscriptionStatus subscription={subscription} />
      </dd>
    </dl>
  );
}
