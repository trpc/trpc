/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */
import type { Post } from '@prisma/client';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';
import { prisma } from '../prisma';
import type { PubSubEvent } from '../pubsub';
import { listen, publish } from '../pubsub';
import { z } from 'zod';
import { authedProcedure, publicProcedure, router } from '../trpc';
import { on } from 'node:events';

type EventMap<T> = Record<keyof T, any[]>;
class IterableEventEmitter<T extends EventMap<T>> extends EventEmitter<T> {
  toIterable<TEventName extends keyof T & string>(
    eventName: TEventName,
    opts?: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<T[TEventName]> {
    return on(this as any, eventName, opts) as any;
  }
}

interface MyEvents {
  add: [Post];
  isTypingUpdate: [];
}

// Local to this server instance, fed by `onPubSubEvent()` below
const ee = new IterableEventEmitter<MyEvents>();

// who is currently typing, key is `name`
const currentlyTyping: Record<string, { lastTyped: Date }> =
  Object.create(null);

function setTyping(name: string, typing: boolean) {
  if (typing) {
    currentlyTyping[name] = { lastTyped: new Date() };
  } else if (currentlyTyping[name]) {
    delete currentlyTyping[name];
  } else {
    return;
  }
  ee.emit('isTypingUpdate');
}

async function onPubSubEvent(event: PubSubEvent) {
  switch (event.type) {
    case 'isTyping': {
      setTyping(event.name, event.typing);
      return;
    }
    case 'add': {
      setTyping(event.name, false);
      const post = await prisma.post.findUnique({
        where: { id: event.postId },
      });
      if (post) {
        ee.emit('add', post);
      }
      return;
    }
  }
}

// Handle events one at a time so posts are emitted in the order they were published
let pubSubQueue = Promise.resolve();
function ensureListening() {
  return listen((event) => {
    pubSubQueue = pubSubQueue
      .then(() => onPubSubEvent(event))
      .catch((cause) => {
        console.error('Failed to handle pubsub event', event, cause);
      });
  });
}

// every 1s, clear old "isTyping"
const interval = setInterval(() => {
  let updated = false;
  const now = Date.now();
  for (const [key, value] of Object.entries(currentlyTyping)) {
    if (now - value.lastTyped.getTime() > 3e3) {
      delete currentlyTyping[key];
      updated = true;
    }
  }
  if (updated) {
    ee.emit('isTypingUpdate');
  }
}, 3e3);
process.on('SIGTERM', () => {
  clearInterval(interval);
});

export const postRouter = router({
  add: authedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        text: z.string().min(1),
      }),
    )
    .mutation(async (opts) => {
      const { input, ctx } = opts;
      const { name } = ctx.user;
      const post = await prisma.post.create({
        data: {
          ...input,
          name,
          source: 'GITHUB',
        },
      });
      await publish({ type: 'add', postId: post.id, name });
      return post;
    }),

  isTyping: authedProcedure
    .input(z.object({ typing: z.boolean() }))
    .mutation(async (opts) => {
      await publish({
        type: 'isTyping',
        name: opts.ctx.user.name,
        typing: opts.input.typing,
      });
    }),

  infinite: publicProcedure
    .input(
      z.object({
        cursor: z.date().nullish(),
        take: z.number().min(1).max(50).nullish(),
      }),
    )
    .query(async (opts) => {
      const { input } = opts;
      const take = input.take ?? 10;
      const cursor = input.cursor;

      const page = await prisma.post.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        cursor: cursor ? { createdAt: cursor } : undefined,
        take: take + 1,
        skip: 0,
      });
      const items = page.reverse();
      let nextCursor: typeof cursor | null = null;
      if (items.length > take) {
        const prev = items.shift();

        nextCursor = prev!.createdAt;
      }
      return {
        items,
        nextCursor,
      };
    }),

  onAdd: publicProcedure.subscription(() => {
    return observable<Post>((emit) => {
      const onAdd = (data: Post) => {
        emit.next(data);
      };
      ee.on('add', onAdd);
      ensureListening().catch((cause) => emit.error(cause));
      return () => {
        ee.off('add', onAdd);
      };
    });
  }),

  whoIsTyping: publicProcedure.subscription(() => {
    let prev: string[] | null = null;
    return observable<string[]>((emit) => {
      const onIsTypingUpdate = () => {
        const newData = Object.keys(currentlyTyping);

        if (prev?.toString() !== newData.toString()) {
          emit.next(newData);
        }
        prev = newData;
      };
      ee.on('isTypingUpdate', onIsTypingUpdate);
      ensureListening().catch((cause) => emit.error(cause));
      return () => {
        ee.off('isTypingUpdate', onIsTypingUpdate);
      };
    });
  }),
});
