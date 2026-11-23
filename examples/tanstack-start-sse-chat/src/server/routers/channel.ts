import EventEmitter, { on } from 'node:events';
import type { TRPCRouterRecord } from '@trpc/server';
import { z } from 'zod';
import { db } from '~/server/db/client';
import type { PostType } from '~/server/db/schema';
import { Channel } from '~/server/db/schema';
import { listen, publish } from '~/server/pubsub';
import { authedProcedure, publicProcedure } from '~/server/trpc';

export type WhoIsTyping = Record<string, { lastTyped: Date }>;

type EventMap<T> = Record<keyof T, any[]>;
class IterableEventEmitter<T extends EventMap<T>> extends EventEmitter<T> {
  toIterable<TEventName extends keyof T & string>(
    eventName: TEventName,
    opts?: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<T[TEventName]> {
    return on(this as any, eventName, opts) as any;
  }
}

export interface MyEvents {
  add: [post: PostType];
  isTypingUpdate: [];
}

// Local to this server instance, fed by `ensureListening()` below
export const ee = new IterableEventEmitter<MyEvents>();

// who is currently typing for each channel, key is `name`
export const currentlyTyping: Record<string, WhoIsTyping> = Object.create(null);

function setTyping(channelId: string, name: string, typing: boolean) {
  currentlyTyping[channelId] ??= {};
  if (typing) {
    currentlyTyping[channelId][name] = { lastTyped: new Date() };
  } else if (currentlyTyping[channelId][name]) {
    delete currentlyTyping[channelId][name];
  } else {
    return;
  }
  ee.emit('isTypingUpdate');
}

// Handle events one at a time so posts are emitted in the order they were published
let pubSubQueue = Promise.resolve();
export function ensureListening() {
  return listen((event) => {
    pubSubQueue = pubSubQueue
      .then(async () => {
        switch (event.type) {
          case 'isTyping': {
            setTyping(event.channelId, event.name, event.typing);
            return;
          }
          case 'add': {
            setTyping(event.channelId, event.name, false);
            const post = await db.query.Post.findFirst({
              where: (fields, ops) => ops.eq(fields.id, event.postId),
            });
            if (post) {
              ee.emit('add', post);
            }
            return;
          }
        }
      })
      .catch((cause) => {
        console.error('Failed to handle pubsub event', event, cause);
      });
  });
}

// every 3s, clear old "isTyping"
setInterval(() => {
  let changed = false;
  const now = Date.now();
  for (const typers of Object.values(currentlyTyping)) {
    for (const [name, value] of Object.entries(typers)) {
      if (now - value.lastTyped.getTime() > 3e3) {
        delete typers[name];
        changed = true;
      }
    }
  }
  if (changed) {
    ee.emit('isTypingUpdate');
  }
}, 3e3).unref();

export const channelRouter = {
  list: publicProcedure.query(() => {
    return db.query.Channel.findMany();
  }),

  create: authedProcedure
    .input(z.object({ name: z.string().trim().min(2) }))
    .mutation(async (opts) => {
      const [channel] = await db
        .insert(Channel)
        .values({
          name: opts.input.name,
        })
        .returning();

      // oxlint-disable-next-line typescript/no-non-null-assertion
      return channel!.id;
    }),

  isTyping: authedProcedure
    .input(z.object({ channelId: z.string().uuid(), typing: z.boolean() }))
    .mutation(async (opts) => {
      await publish({
        type: 'isTyping',
        channelId: opts.input.channelId,
        name: opts.ctx.user.name,
        typing: opts.input.typing,
      });
    }),

  /**
   * Who is typing in every channel, so that switching channels doesn't need a
   * new subscription. The client picks out the channel it shows.
   */
  whoIsTyping: publicProcedure.subscription(async function* (opts) {
    // Listen before reading the current state, so no update is missed in between
    const updates = ee.toIterable('isTypingUpdate', { signal: opts.signal });
    await ensureListening();

    let lastSent = '';
    /**
     * yield who is typing if it has changed
     * won't yield if it's the same as last time
     */
    function* maybeYield() {
      // Who is typing in each channel, leaving out channels where nobody is
      const whoIsTyping: Record<string, string[]> = {};
      for (const [channelId, who] of Object.entries(currentlyTyping)) {
        const names = Object.keys(who).toSorted();
        if (names.length > 0) {
          whoIsTyping[channelId] = names;
        }
      }
      const key = JSON.stringify(whoIsTyping);
      if (key === lastSent) {
        return;
      }
      lastSent = key;
      yield whoIsTyping;
    }

    // emit who is currently typing
    yield* maybeYield();

    for await (const _ of updates) {
      yield* maybeYield();
    }
  }),
} satisfies TRPCRouterRecord;
