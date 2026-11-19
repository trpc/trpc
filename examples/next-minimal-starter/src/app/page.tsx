import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Skeleton } from '@shared/ui/components/skeleton';
import { Suspense } from 'react';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';
import { Greeting } from './greeting';
import { LoopData } from './loop-data';

// The tRPC context reads `headers()`, so the page renders on every request
export const dynamic = 'force-dynamic';

export default function IndexPage() {
  prefetch(trpc.greeting.queryOptions({ name: 'Next.js' }));

  return (
    <HydrateClient>
      <header className="border-b bg-background">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-brand">tRPC</span> Next.js Minimal Starter
          </h1>
          <p className="text-sm text-muted-foreground">
            The Next.js App Router with @trpc/tanstack-react-query
          </p>
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl gap-6 p-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Query</CardTitle>
            <CardDescription>
              The <code>greeting</code> query, prefetched in a server component
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense
              fallback={
                <Skeleton className="h-8 w-40" aria-label="Loading greeting" />
              }
            >
              <Greeting />
            </Suspense>
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
            <LoopData />
          </CardContent>
        </Card>
      </main>
    </HydrateClient>
  );
}
