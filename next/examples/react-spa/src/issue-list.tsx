import { Avatar, AvatarFallback } from '@shared/ui/components/avatar';
import { Badge } from '@shared/ui/components/badge';
import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Input } from '@shared/ui/components/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@shared/ui/components/item';
import { Skeleton } from '@shared/ui/components/skeleton';
import { Spinner } from '@shared/ui/components/spinner';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import type { Issue } from '../server/tracker.ts';
import { isDraft, listOptions, updateIssues } from './issues.ts';
import { useOnline } from './online.ts';
import { useDirectory, useTracker } from './trpc.tsx';

export const dateFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
});

/** Names from the second API, the directory, cached under its key prefix. */
export function useUserNames() {
  const directory = useDirectory();
  const users = useQuery(
    directory.user.list.queryOptions({ staleTime: Infinity }),
  );
  return new Map(users.data?.map((user) => [user.id, user.name]));
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('');

export function NewIssue() {
  const trpc = useTracker();
  const [title, setTitle] = useState('');
  // The optimistic draft and the offline queue come from the defaults
  // registered for this key (`registerIssueMutations`).
  const create = useMutation(trpc.issue.create.mutationOptions());
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title });
    setTitle('');
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        aria-label="New issue title"
        placeholder="Describe a new issue…"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="bg-background"
      />
      <Button type="submit">
        <PlusIcon data-icon="inline-start" />
        New issue
      </Button>
    </form>
  );
}

function IssueRow(props: {
  issue: Issue;
  selected: boolean;
  assignee: string | undefined;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const online = useOnline();
  const draft = isDraft(props.issue);
  return (
    <Item
      variant="outline"
      size="sm"
      role="listitem"
      aria-label={props.issue.title}
      aria-current={props.selected}
      className={
        props.selected ? 'border-primary bg-primary/5' : 'bg-background'
      }
    >
      <ItemMedia>
        <Avatar size="sm">
          <AvatarFallback>
            {props.assignee ? initials(props.assignee) : '–'}
          </AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {draft ? (
            props.issue.title
          ) : (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={props.onSelect}
            >
              {props.issue.title}
            </button>
          )}
        </ItemTitle>
        <ItemDescription>
          {draft
            ? 'Not saved yet'
            : `#${props.issue.number} · ${dateFormat.format(props.issue.createdAt)} · ${props.assignee ?? 'Unassigned'}`}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {draft ? (
          <Badge variant="outline">
            {online ? <Spinner /> : null}
            {online ? 'Saving' : 'Queued'}
          </Badge>
        ) : (
          <>
            <Badge
              variant={props.issue.status === 'open' ? 'default' : 'secondary'}
            >
              {props.issue.status}
            </Badge>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${props.issue.title}`}
              onClick={props.onDelete}
            >
              <Trash2Icon />
            </Button>
          </>
        )}
      </ItemActions>
    </Item>
  );
}

export function IssueList(props: {
  selected: string | null;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const trpc = useTracker();
  const queryClient = useQueryClient();
  const names = useUserNames();
  const list = listOptions(trpc);
  const issues = useInfiniteQuery(list);
  const remove = useMutation(
    trpc.issue.delete.mutationOptions({
      // Gone from the list at once; the refetch afterwards confirms it.
      onMutate: async (input) => {
        props.onDeleted(input.id);
        queryClient.removeQueries(
          trpc.issue.byId.queryFilter({ input: { id: input.id } }),
        );
        await queryClient.cancelQueries({ queryKey: list.queryKey });
        queryClient.setQueryData(list.queryKey, (pages) =>
          updateIssues(pages, (items) =>
            items.filter((issue) => issue.id !== input.id),
          ),
        );
      },
      onSettled: () => queryClient.invalidateQueries(trpc.issue.pathFilter()),
    }),
  );
  const items = issues.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Issues</CardTitle>
        <CardDescription>
          {issues.data
            ? `${items.length} loaded, newest first`
            : 'Loading the first page…'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2" role="list" aria-label="Issues">
          {issues.isPending
            ? Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))
            : items.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  selected={issue.id === props.selected}
                  assignee={
                    issue.assigneeId ? names.get(issue.assigneeId) : undefined
                  }
                  onSelect={() => props.onSelect(issue.id)}
                  onDelete={() => remove.mutate({ id: issue.id })}
                />
              ))}
        </ItemGroup>
      </CardContent>
      {issues.hasNextPage && (
        <CardFooter>
          <Button
            variant="outline"
            className="w-full"
            disabled={issues.isFetchingNextPage}
            onClick={() => issues.fetchNextPage()}
          >
            {issues.isFetchingNextPage && <Spinner />}
            Load more
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
