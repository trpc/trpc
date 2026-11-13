import { Badge } from '@shared/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Switch } from '@shared/ui/components/switch';
import {
  NETWORK_LATENCY_MS,
  setPipelining,
  usePipelining,
  useRequestLog,
} from '~/lib/blog-demo';

export function RequestLog() {
  const pipelining = usePipelining();
  const requests = useRequestLog();
  const done = requests.every((request) => request.endedAt !== null);
  const total = Math.max(0, ...requests.map((request) => request.endedAt ?? 0));
  const scale = Math.max(total, 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requests for this page</CardTitle>
        <CardDescription>
          Every request to the blog waits {NETWORK_LATENCY_MS}ms, as on a slow
          network. Open a post and watch.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex items-center justify-between gap-4 text-sm font-medium">
          Pipelining
          <Switch
            checked={pipelining}
            onCheckedChange={(checked) => setPipelining(checked)}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          {pipelining
            ? 'The authors’ ids are in the posts. The server reads them there and loads the authors in the same request.'
            : 'The authors’ ids are in the posts, so the browser waits for the posts before it can ask for the authors.'}
        </p>

        {requests.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No requests yet. The server rendered this page, or its data was
            cached.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {requests.map((request, index) => (
              <li key={request.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">Request {index + 1}</span>
                  <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                    {request.pipelined && (
                      <Badge variant="secondary">pipelined</Badge>
                    )}
                    {request.endedAt === null
                      ? '…'
                      : `${Math.round(request.startedAt)}–${Math.round(request.endedAt)}ms`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      marginLeft: `${(request.startedAt / scale) * 100}%`,
                      width: `${(((request.endedAt ?? scale) - request.startedAt) / scale) * 100}%`,
                    }}
                  />
                </div>
                <ul className="font-mono text-xs text-muted-foreground">
                  {request.procedures.map((procedure, procedureIndex) => (
                    <li key={procedureIndex}>{procedure}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}

        {requests.length > 0 && done && (
          <p className="text-sm font-medium tabular-nums">
            {requests.length} {requests.length === 1 ? 'request' : 'requests'},
            done after {Math.round(total)}ms
          </p>
        )}
      </CardContent>
    </Card>
  );
}
