/**
 * This is a Next.js page.
 */
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { Badge } from '@shared/ui/components/badge';
import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Skeleton } from '@shared/ui/components/skeleton';
import { Spinner } from '@shared/ui/components/spinner';
import { CircleAlertIcon } from 'lucide-react';
import Head from 'next/head';
import React from 'react';
import { trpc } from '../utils/trpc';

function QueryExample() {
  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  const greetingQuery = trpc.greeting.useQuery({ name: 'client' });

  switch (greetingQuery.status) {
    case 'pending':
      return <Skeleton className="h-8 w-40" aria-label="Loading greeting" />;
    case 'error':
      return (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Couldn't load the greeting</AlertTitle>
          <AlertDescription>{greetingQuery.error.message}</AlertDescription>
        </Alert>
      );
    case 'success':
      return (
        /**
         * The type is defined and can be autocompleted
         * 💡 Tip: Hover over `data` to see the result type
         * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
         * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
         */
        <p className="text-2xl font-semibold">{greetingQuery.data.text}</p>
      );
  }
}

function SubscriptionStatus(props: {
  subscription: ReturnType<typeof trpc.loopData.useSubscription>;
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

function SubscriptionExample() {
  const subscription = trpc.loopData.useSubscription();
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

let hasEverMounted = false;

function NoSSR(props: { children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = React.useState(hasEverMounted);
  React.useEffect(() => {
    hasEverMounted = true;
    setHasMounted(true);
  }, []);
  return hasMounted ? <>{props.children}</> : null;
}

export default function IndexPage() {
  return (
    <div className="min-h-svh bg-muted/40">
      <Head>
        <title>tRPC Next.js Minimal Starter</title>
      </Head>
      <header className="border-b bg-background">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-brand">tRPC</span> Next.js Minimal Starter
          </h1>
          <p className="text-sm text-muted-foreground">
            The Next.js pages router with @trpc/next
          </p>
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl gap-6 p-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Query</CardTitle>
            <CardDescription>
              The <code>greeting</code> query, prefetched on the server
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QueryExample />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              <code>loopData</code> sends an event every second over server-sent
              events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NoSSR>
              <SubscriptionExample />
            </NoSSR>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
