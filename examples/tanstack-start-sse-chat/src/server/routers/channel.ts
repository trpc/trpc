import EventEmitter, { on } from 'node:events';
import type { TRPCRouterRecord } from '@trpc/server';
import { z } from 'zod';
import { db } from '~/server/db/client';
import type { PostType } from '~/server/db/schema';
import { Channel } from '~/server/db/schema';
import type { PubSubEvent } from '~/server/pubsub';
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
  add: [channelId: string, data: PostType];
  isTypingUpdate: [channelId: string, who: WhoIsTyping];
}

// Local to this server instance, fed by `onPubSubEvent()` below
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
  ee.emit('isTypingUpdate', channelId, currentlyTyping[channelId]);
}

async function onPubSubEvent(event: PubSubEvent) {
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
        ee.emit('add', event.channelId, post);
      }
      return;
    }
  }
}

// Handle events one at a time so posts are emitted in the order they were published
let pubSubQueue = Promise.resolve();
export function ensureListening() {
  return listen((event) => {
    pubSubQueue = pubSubQueue
      .then(() => onPubSubEvent(event))
      .catch((cause) => {
        console.error('Failed to handle pubsub event', event, cause);
      });
  });
}

// every 1s, clear old "isTyping"
setInterval(() => {
  const updatedChannels = new Set<string>();
  const now = Date.now();
  for (const [channelId, typers] of Object.entries(currentlyTyping)) {
    for (const [key, value] of Object.entries(typers ?? {})) {
      if (now - value.lastTyped.getTime() > 3e3) {
        delete typers[key];
        updatedChannels.add(channelId);
      }
    }
  }
  updatedChannels.forEach((channelId) => {
    ee.emit('isTypingUpdate', channelId, currentlyTyping[channelId] ?? {});
  });
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

  whoIsTyping: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
      }),
    )
    .subscription(async function* (opts) {
      const { channelId } = opts.input;

      await ensureListening();

      let lastIsTyping = '';

      /**
       * yield who is typing if it has changed
       * won't yield if it's the same as last time
       */
      function* maybeYield(who: WhoIsTyping) {
        const idx = Object.keys(who).toSorted().toString();
        if (idx === lastIsTyping) {
          return;
        }
        yield Object.keys(who);

        lastIsTyping = idx;
      }

      // emit who is currently typing
      yield* maybeYield(currentlyTyping[channelId] ?? {});

      for await (const [channelId, who] of ee.toIterable('isTypingUpdate', {
        signal: opts.signal,
      })) {
        if (channelId === opts.input.channelId) {
          yield* maybeYield(who);
        }
      }
    }),
} satisfies TRPCRouterRecord;
