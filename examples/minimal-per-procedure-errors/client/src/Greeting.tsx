import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

function GreetingResult() {
  const greetingQuery = useQuery(
    trpc.greeting.queryOptions({ name: 'tRPC user' }),
  );

  // 💡 `greeting` has no `.errors()` of its own, so `greetingQuery.error.data`
  //    only ever has the router-wide shape - try reading `.kind` off it.
  switch (greetingQuery.status) {
    case 'pending':
      return <Skeleton className="h-6 w-40" aria-label="Loading greeting" />;
    case 'error':
      return <p className="text-destructive">{greetingQuery.error.message}</p>;
    case 'success':
      return <p className="text-lg font-semibold">{greetingQuery.data.text}</p>;
  }
}

export function Greeting() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <code>greeting</code>
        </CardTitle>
        <CardDescription>
          A procedure without its own <code>.errors()</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GreetingResult />
      </CardContent>
    </Card>
  );
}
