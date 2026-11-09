import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { useQuery } from '@tanstack/react-query';
import { useTracker } from './trpc.tsx';

const shown = 6;

const timeFormat = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Every event from the `activity` subscription, newest kept, in the query
 * cache: another component reading this key shares the one stream.
 */
export function ActivityFeed() {
  const trpc = useTracker();
  const events = useQuery(
    trpc.activity.streamedOptions({
      input: { last: shown },
      maxChunks: shown,
    }),
  );
  const newestFirst = [...(events.data ?? [])].reverse();
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Streamed into the query cache</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-1.5 text-sm" aria-label="Activity">
          {newestFirst.length === 0 && (
            <li className="text-muted-foreground">Nothing yet.</li>
          )}
          {newestFirst.map((event) => (
            <li key={event.id} className="flex justify-between gap-4">
              <span className="truncate">{event.text}</span>
              <time className="shrink-0 text-muted-foreground tabular-nums">
                {timeFormat.format(event.at)}
              </time>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
