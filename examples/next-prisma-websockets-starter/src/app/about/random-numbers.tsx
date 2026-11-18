'use client';

import { Badge } from '@shared/ui/components/badge';
import { buttonVariants } from '@shared/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Skeleton } from '@shared/ui/components/skeleton';
import { Spinner } from '@shared/ui/components/spinner';
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTRPC } from '~/trpc/client';
import { useSubscription } from '@trpc/tanstack-react-query';

export function RandomNumbers() {
  const trpc = useTRPC();
  const [num, setNumber] = useState<number>();
  const randomNumber = useSubscription(
    trpc.randomNumber.subscriptionOptions(undefined, {
      onData(n) {
        setNumber(n);
      },
    }),
  );

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Random numbers</CardTitle>
          <CardDescription>
            Here&apos;s a random number from a sub: <code>randomNumber</code>{' '}
            sends one every 500 ms.
          </CardDescription>
          <CardAction>
            {(() => {
              switch (randomNumber.status) {
                case 'idle':
                  return <Badge variant="outline">Idle</Badge>;
                case 'connecting':
                  return (
                    <Badge variant="secondary">
                      <Spinner />
                      Connecting
                    </Badge>
                  );
                case 'pending':
                  return (
                    <Badge variant="outline">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Live
                    </Badge>
                  );
                case 'error':
                  return <Badge variant="destructive">Disconnected</Badge>;
              }
            })()}
          </CardAction>
        </CardHeader>
        <CardContent>
          {num === undefined ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <p className="font-mono text-4xl font-semibold tabular-nums">
              {num.toFixed(8)}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Link
            href="/"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <ArrowLeftIcon />
            Index
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
