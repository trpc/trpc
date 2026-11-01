import {
  createFetchHandler,
  experimental_Publisher,
  initTrpc,
  tracked,
} from '@trpc12/trpc/server';
import { Effect, Layer, Stream } from 'effect';
import { z } from 'zod';

import { rooms } from './rooms.ts';

export interface Message {
  readonly from: string;
  readonly text: string;
  /** When the server got it. */
  readonly at: string;
}

// #region publisher
/** A channel per room for its messages, and one for who's in it. */
type ChatEvents = {
  [room: `messages:${string}`]: Message;
  [room: `online:${string}`]: ReadonlyArray<string>;
};

class Chat extends experimental_Publisher.Service<Chat, ChatEvents>()('Chat') {}
// #endregion publisher

// #region presence
/** Who's in each room: how many subscriptions each user has open there. */
const online = new Map<string, Map<string, number>>();

/**
 * A user's subscription to a room opened (`+1`) or closed (`-1`): publishes
 * who's in the room now, with the event's id.
 */
const presence = (room: string, user: string, change: 1 | -1) =>
  Effect.suspend(() => {
    const users = online.get(room) ?? new Map<string, number>();
    const count = (users.get(user) ?? 0) + change;
    if (count > 0) {
      users.set(user, count);
    } else {
      users.delete(user);
    }
    online.set(room, users);
    const here = [...users.keys()].sort();
    return Effect.map(Chat.publish(`online:${room}`, here), (id) =>
      tracked(id, here),
    );
  });
// #endregion presence

const t = initTrpc<{ ctx: { user: string } }>();

const Room = z.object({ room: z.enum(rooms) });

// #region router
export const appRouter = t.router({
  room: {
    send: t.procedure
      .input(Room.extend({ text: z.string().trim().min(1).max(280) }))
      .mutation((opts) =>
        Chat.publish(`messages:${opts.input.room}`, {
          from: opts.ctx.user,
          text: opts.input.text,
          at: new Date().toISOString(),
        }),
      ),
    /**
     * The room's messages as `tracked()` events. A reconnect sends the last
     * one's id back as `lastEventId`, and gets only what it missed. The
     * in-memory publisher's ids count up from 1, so a new subscriber starts
     * after `'0'`: every message it keeps.
     */
    messages: t.procedure.input(Room).subscription((opts) =>
      Chat.subscribe(`messages:${opts.input.room}`, {
        lastEventId: opts.lastEventId ?? '0',
      }),
    ),
    /**
     * Who's in the room, as a list each time it changes. Subscribing joins
     * the room and closing leaves it. Its events have no ids, so a
     * reconnect starts over: it joins again and gets who's there now.
     */
    online: t.procedure.input(Room).subscription((opts) => {
      const room = opts.input.room;
      const user = opts.ctx.user;
      return Stream.unwrap(
        Effect.map(presence(room, user, 1), (joined) =>
          // The list joining published, then every change after it.
          Stream.concat(
            Stream.make(joined),
            Chat.subscribe(`online:${room}`, { lastEventId: joined.id }),
          ),
        ),
      ).pipe(
        Stream.map((event) => event.data),
        Stream.ensuring(presence(room, user, -1)),
      );
    }),
  },
});

export type AppRouter = typeof appRouter;
// #endregion router

// Each room starts with a message, so it has history from the start.
const welcome = Layer.effectDiscard(
  Effect.forEach(rooms, (room) =>
    Chat.publish(`messages:${room}`, {
      from: 'trpc',
      text: `Welcome to #${room}. Say hi to the other browser.`,
      at: new Date().toISOString(),
    }),
  ),
);

// #region handler
export const handler = createFetchHandler({
  router: appRouter,
  // One process's publisher, keeping each channel's last 100 events for
  // the subscribers that resume.
  layer: welcome.pipe(Layer.provideMerge(Chat.memory({ buffer: 100 }))),
  // The demo signs each browser in with a bearer token that is its user's
  // name; an app checks a real one.
  createContext: (opts) => ({
    user:
      opts.request.headers['authorization']?.replace(/^Bearer /, '') ?? 'guest',
  }),
});
// #endregion handler
