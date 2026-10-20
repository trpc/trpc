import { Alert, AlertDescription } from '@shared/ui/components/alert';
import { Button } from '@shared/ui/components/button';
import { Checkbox } from '@shared/ui/components/checkbox';
import { Input } from '@shared/ui/components/input';
import { Spinner } from '@shared/ui/components/spinner';
import {
  useIsMutating,
  useMutation,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';
import { matchError } from '@trpc12/trpc/client';
import { type ReactNode, useState } from 'react';

import { addTodoOptions, toggleTodoOptions } from './optimistic.ts';
import type { Todo } from './server.ts';
import type { AppContext } from './trpc.ts';

export const rootRoute = createRootRouteWithContext<AppContext>()({
  // The list is there when the page first renders.
  loader: (opts) =>
    opts.context.queryClient.query({
      ...opts.context.trpc.todo.list.queryOptions(),
      staleTime: 'static',
    }),
  component: Todos,
});

function Todos(): ReactNode {
  const ctx = rootRoute.useRouteContext();
  const todos = useSuspenseQuery(ctx.trpc.todo.list.queryOptions()).data;
  const add = useMutation(addTodoOptions(ctx));
  const [text, setText] = useState('');
  const [undone, setUndone] = useState<string>();

  // #region submit
  const submit = () => {
    setUndone(undefined);
    add.mutate(
      { id: crypto.randomUUID(), text },
      {
        // The list is back as it was: say why, with one handler per way
        // the call can fail.
        onError: (err, input) =>
          setUndone(
            `“${input.text}” was taken back: ${matchError(err, {
              BAD_REQUEST: (e) => e.data.issues[0]?.message ?? e.message,
              NETWORK_ERROR: () => 'the server couldn’t be reached',
              BAD_RESPONSE: () => 'the server’s answer made no sense',
              unexpected: (e) => e.message,
            })}.`,
          ),
      },
    );
    setText('');
  };
  // #endregion submit

  const done = todos.filter((todo) => todo.done).length;
  return (
    <div className="grid gap-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          aria-label="Something to do"
          onChange={(event) => setText(event.target.value)}
          placeholder="Something to do"
          value={text}
        />
        <Button type="submit">Add</Button>
      </form>
      {undone ? (
        <Alert variant="destructive">
          <AlertDescription>{undone}</AlertDescription>
        </Alert>
      ) : null}
      <ul aria-label="Todos" className="grid gap-1">
        {todos.map((todo) => (
          <TodoRow key={todo.id} onUndone={setUndone} todo={todo} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {done} of {todos.length} done
      </p>
    </div>
  );
}

function TodoRow(props: {
  readonly onUndone: (message: string | undefined) => void;
  readonly todo: Todo;
}): ReactNode {
  const ctx = rootRoute.useRouteContext();
  const todo = props.todo;
  const toggle = useMutation(toggleTodoOptions(ctx));
  // Whether the call that added it is still out: on screen, not saved yet.
  const adding =
    useIsMutating(
      ctx.trpc.todo.add.mutationFilter({
        predicate: (mutation) => mutation.state.variables?.id === todo.id,
      }),
    ) > 0;
  const saving = adding || toggle.isPending;

  const tick = (checked: boolean) => {
    props.onUndone(undefined);
    toggle.mutate(
      { id: todo.id, done: checked },
      {
        onError: (err) =>
          props.onUndone(
            `“${todo.text}” was ${checked ? 'unticked' : 'ticked'} again: ${matchError(
              err,
              {
                BAD_REQUEST: (e) => e.message,
                NETWORK_ERROR: () => 'the server couldn’t be reached',
                BAD_RESPONSE: () => 'the server’s answer made no sense',
                unexpected: (e) => e.message,
              },
            )}.`,
          ),
      },
    );
  };

  return (
    <li
      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 ${saving ? 'text-muted-foreground' : ''}`}
    >
      <Checkbox
        aria-label={todo.text}
        checked={todo.done}
        // A todo the server doesn't have yet can't be ticked there.
        disabled={adding}
        onCheckedChange={tick}
      />
      <span className={todo.done ? 'line-through' : ''}>{todo.text}</span>
      {saving ? (
        <span className="ml-auto flex items-center gap-1 text-xs">
          <Spinner className="size-3" />
          Saving
        </span>
      ) : null}
    </li>
  );
}
