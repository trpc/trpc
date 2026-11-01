import { Alert, AlertDescription } from '@shared/ui/components/alert';
import { Badge } from '@shared/ui/components/badge';
import { Button } from '@shared/ui/components/button';
import { Input } from '@shared/ui/components/input';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { type Room, rooms } from './rooms.ts';
import { rootRoute } from './routes.tsx';
import type { Message } from './server.ts';

export const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rooms/$room',
  params: {
    parse: (params) => ({ room: z.enum(rooms).parse(params.room) }),
    stringify: (params) => params,
  },
  component: RoomPage,
});

function RoomPage(): ReactNode {
  const room = roomRoute.useParams().room;
  const ctx = roomRoute.useRouteContext();
  // #region subscribe
  // Every message so far, kept in the query cache as the subscription's
  // events arrive. It opens with the first component that reads it, and
  // closes when the last one unmounts.
  const messages = useQuery(
    ctx.trpc.room.messages.streamedOptions({ input: { room } }),
  );
  // Who's in the room: the subscription's latest event. Leaving the page
  // closes it, which is leaving the room.
  const online = useQuery(
    ctx.trpc.room.online.liveOptions({ input: { room } }),
  );
  // #endregion subscribe
  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
      <div
        aria-label="Online"
        className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
      >
        Online:
        {online.data === undefined ? (
          <Skeleton className="h-5 w-16" />
        ) : (
          online.data.map((user) => (
            <Badge key={user} variant="secondary">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {user === ctx.user ? `${user} (you)` : user}
            </Badge>
          ))
        )}
      </div>
      {messages.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            The connection was lost: {messages.error.message}
            <Button onClick={() => messages.refetch()} size="sm">
              Reconnect
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Messages events={messages.data} you={ctx.user} />
      )}
      <SendForm room={room} />
    </div>
  );
}

function Messages(props: {
  readonly events: ReadonlyArray<{ id: string; data: Message }> | undefined;
  readonly you: string;
}): ReactNode {
  const list = useRef<HTMLOListElement>(null);
  const count = props.events?.length;
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [count]);
  if (props.events === undefined) {
    return <Skeleton className="h-full w-full" />;
  }
  return (
    <ol
      aria-label="Messages"
      className="grid content-start gap-2 overflow-y-auto pr-1"
      ref={list}
    >
      {props.events.map((event) => {
        const mine = event.data.from === props.you;
        return (
          <li
            className={`grid max-w-[85%] gap-0.5 ${mine ? 'justify-self-end text-right' : ''}`}
            key={event.id}
          >
            <span className="text-xs text-muted-foreground">
              {event.data.from} ·{' '}
              {new Date(event.data.at).toLocaleTimeString([], {
                timeStyle: 'medium',
              })}{' '}
              <span title="The event's id, which a reconnect resumes after">
                #{event.id}
              </span>
            </span>
            <p
              className={`rounded-lg px-3 py-1.5 text-sm ${mine ? 'bg-brand/15' : 'bg-muted'}`}
            >
              {event.data.text}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function SendForm(props: { readonly room: Room }): ReactNode {
  const ctx = roomRoute.useRouteContext();
  const [text, setText] = useState('');
  const send = useMutation(
    ctx.trpc.room.send.mutationOptions({ onSuccess: () => setText('') }),
  );
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        send.mutate({ room: props.room, text });
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Message"
          onChange={(event) => setText(event.target.value)}
          placeholder={`Message #${props.room}`}
          value={text}
        />
        <Button disabled={send.isPending || !text.trim()} type="submit">
          Send
        </Button>
      </div>
      {send.error ? (
        <p className="text-xs text-destructive" role="alert">
          {send.error.code === 'NETWORK_ERROR'
            ? 'Not sent: the server couldn’t be reached. Send it again.'
            : send.error.message}
        </p>
      ) : null}
    </form>
  );
}
