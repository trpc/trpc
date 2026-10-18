import { Badge } from '@shared/ui/components/badge';
import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Separator } from '@shared/ui/components/separator';
import { Skeleton } from '@shared/ui/components/skeleton';
import { Textarea } from '@shared/ui/components/textarea';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useSubscription } from '@trpc12/tanstack-react-query';
import { useState, type SubmitEvent } from 'react';
import { dateFormat, useUserNames } from './issue-list.tsx';
import { listOptions, updateIssues } from './issues.ts';
import { useTracker } from './trpc.tsx';

/** Who comments in this demo. */
const me = 'ada';

const timeFormat = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function IssueDetailSkeleton() {
  return (
    <Card aria-busy>
      <CardHeader>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </CardContent>
    </Card>
  );
}

/**
 * The comments rendered from the query, kept current by the subscription:
 * each event lands in the same cache entry, deduplicated by id.
 */
function Comments(props: { issueId: string }) {
  const trpc = useTracker();
  const queryClient = useQueryClient();
  const names = useUserNames();
  const input: { issueId: string } = { issueId: props.issueId };
  const comments = useSuspenseQuery(trpc.comment.list.queryOptions({ input }));
  const live = useSubscription(
    trpc.comment.onAdd.subscriptionOptions({
      input,
      onData: (event) =>
        queryClient.setQueryData(
          trpc.comment.list.queryKey({ input }),
          (old = []) =>
            old.some((comment) => comment.id === event.data.id)
              ? old
              : [...old, event.data],
        ),
    }),
  );
  const [body, setBody] = useState('');
  const add = useMutation(trpc.comment.add.mutationOptions());
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    add.mutate({ issueId: props.issueId, author: me, body });
    setBody('');
  };
  return (
    <>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Comments</h3>
          {live.status === 'error' ? (
            <Button variant="outline" size="xs" onClick={live.reset}>
              Reconnect
            </Button>
          ) : (
            <Badge variant={live.status === 'idle' ? 'outline' : 'default'}>
              {live.status === 'idle' ? 'Idle' : 'Live'}
            </Badge>
          )}
        </div>
        <ol className="flex flex-col gap-2" aria-label="Comments">
          {comments.data.length === 0 && (
            <li className="text-sm text-muted-foreground">No comments yet.</li>
          )}
          {comments.data.map((comment) => (
            <li key={comment.id} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{names.get(comment.author) ?? comment.author}</span>
                <time>{timeFormat.format(comment.createdAt)}</time>
              </div>
              {comment.body}
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter>
        <form onSubmit={submit} className="flex w-full flex-col gap-2">
          <Textarea
            aria-label="Comment"
            placeholder={`Comment as ${names.get(me) ?? me}…`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button type="submit" className="self-end" disabled={add.isPending}>
            Comment
          </Button>
        </form>
      </CardFooter>
    </>
  );
}

export function IssueDetail(props: { id: string }) {
  const trpc = useTracker();
  const queryClient = useQueryClient();
  const names = useUserNames();
  const issue = useSuspenseQuery(
    trpc.issue.byId.queryOptions({ input: { id: props.id } }),
  );
  const list = listOptions(trpc);
  const setStatus = useMutation(
    trpc.issue.setStatus.mutationOptions({
      onMutate: (change) => {
        queryClient.setQueryData(
          trpc.issue.byId.queryKey({ input: { id: change.id } }),
          (old) => (old ? { ...old, status: change.status } : old),
        );
        queryClient.setQueryData(list.queryKey, (pages) =>
          updateIssues(pages, (items) =>
            items.map((item) =>
              item.id === change.id ? { ...item, status: change.status } : item,
            ),
          ),
        );
      },
      onSettled: () => queryClient.invalidateQueries(trpc.issue.pathFilter()),
    }),
  );
  const next = issue.data.status === 'open' ? 'closed' : 'open';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{issue.data.title}</CardTitle>
        <CardDescription>
          #{issue.data.number} opened {dateFormat.format(issue.data.createdAt)}{' '}
          ·{' '}
          {issue.data.assigneeId
            ? `assigned to ${names.get(issue.data.assigneeId) ?? issue.data.assigneeId}`
            : 'unassigned'}
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatus.mutate({ id: props.id, status: next })}
          >
            {next === 'closed' ? 'Close issue' : 'Reopen issue'}
          </Button>
        </CardAction>
      </CardHeader>
      <Separator />
      <Comments issueId={props.id} />
    </Card>
  );
}
