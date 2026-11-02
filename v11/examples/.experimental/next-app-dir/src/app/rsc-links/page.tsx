import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Skeleton } from '@shared/ui/components/skeleton';
import { Suspense } from 'react';
import { api } from '~/trpc/server-invoker';
import { Badge } from '../_components/client-ui';
import { JsonBlock } from '../_components/json-block';
import { PageHeader } from '../_components/page-header';
import { ServerInvokedGreeting } from './ServerInvokedGreeting';

export const dynamic = 'force-dynamic';

async function AuthThing() {
  const me = await api.me.query();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session</CardTitle>
        <CardDescription>
          <code>me</code> returns the session from the request&apos;s cookies.
        </CardDescription>
        <CardAction>
          {me ? (
            <Badge>Signed in</Badge>
          ) : (
            <Badge variant="outline">Signed out</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <JsonBlock label="Session" value={me} />
      </CardContent>
    </Card>
  );
}

function GreetingsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export default async function Home() {
  return (
    <>
      <PageHeader
        title="Server Components with tRPC's Next.js links"
        description={
          <>
            <code>experimental_nextCacheLink</code> calls procedures from Server
            Components without an HTTP request, and caches each result for five
            seconds, or until you revalidate it.
          </>
        }
      />

      <Suspense fallback={<GreetingsSkeleton />}>
        <ServerInvokedGreeting />
      </Suspense>

      <AuthThing />
    </>
  );
}
