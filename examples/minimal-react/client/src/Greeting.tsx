import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { trpc } from './utils/trpc';

function GreetingResult() {
  const greetingQuery = useQuery(
    trpc.greeting.queryOptions({ name: 'tRPC user' }),
  );

  if (greetingQuery.isPending) {
    return <Skeleton className="h-8 w-48" aria-label="Loading greeting" />;
  }
  if (greetingQuery.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Couldn't load the greeting</AlertTitle>
        <AlertDescription>
          {greetingQuery.error.message}. Is the server running on port 2022?
        </AlertDescription>
      </Alert>
    );
  }
  return <p className="text-2xl font-semibold">{greetingQuery.data.text}</p>;
}

export function Greeting() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Greeting</CardTitle>
        <CardDescription>
          The result of the <code>greeting</code> query
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GreetingResult />
      </CardContent>
    </Card>
  );
}
