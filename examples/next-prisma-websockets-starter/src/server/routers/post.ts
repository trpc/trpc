/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */
import type { Post } from '@prisma/client';
import { TRPCError, type SSEChunk } from '@trpc/server';
import { EventEmitter, on } from 'events';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authedProcedure, publicProcedure, router } from '../trpc';

interface MyEvents {
  add: (data: Post) => void;
  isTypingUpdate: () => void;
}
declare interface MyEventEmitter {
  on<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  off<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  once<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  emit<TEv extends keyof MyEvents>(
    event: TEv,
    ...args: Parameters<MyEvents[TEv]>
  ): boolean;
}

class MyEventEmitter extends EventEmitter {
  public toIterable<TEv extends keyof MyEvents>(
    event: TEv,
  ): AsyncIterable<Parameters<MyEvents[TEv]>> {
    return on(this, event);
  }
}

// iife
const run = <TReturn>(fn: () => TReturn) => fn();

// In a real app, you'd probably use Redis or something
const ee = new MyEventEmitter();

// who is currently typing, key is `name`
const currentlyTyping: Record<string, { lastTyped: Date }> =
  Object.create(null);

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
    .mutation(async ({ input, ctx }) => {
      const { name } = ctx.user;
      const post = await prisma.post.create({
        data: {
          ...input,
          name,
          source: 'GITHUB',
        },
      });
      ee.emit('add', post);
      delete currentlyTyping[name];
      ee.emit('isTypingUpdate');
      return post;
    }),

  isTyping: authedProcedure
    .input(z.object({ typing: z.boolean() }))
    .mutation(({ input, ctx }) => {
      const { name } = ctx.user;
      if (!input.typing) {
        delete currentlyTyping[name];
      } else {
        currentlyTyping[name] = {
          lastTyped: new Date(),
        };
      }
      ee.emit('isTypingUpdate');
    }),

  infinite: publicProcedure
    .input(
      z.object({
        cursor: z.date().nullish(),
        take: z.number().min(1).max(50).nullish(),
      }),
    )
    .query(async ({ input }) => {
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        nextCursor = prev!.createdAt;
      }
      return {
        items,
        nextCursor,
      };
    }),

  onAdd: publicProcedure
    .input(
      z.object({
        lastEventId: z.string().nullish(),
      }),
    )
    .subscription(async function* (opts) {
      // push all items from the lastEventId
      yield* run(async function* () {
        if (!opts.input.lastEventId) {
          return;
        }
        const itemById = await prisma.post.findUnique({
          where: {
            id: opts.input.lastEventId,
          },
        });

        if (!itemById) {
          return;
        }
        // if there's more than 100 items, we should throw
        const numItems = await prisma.post.count({
          where: {
            createdAt: {
              gt: itemById.createdAt,
            },
          },
        });
        if (numItems > 100) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Too many items since last connected, please refresh the page',
          });
        }
        // get all items after the lastEventId
        const items = await prisma.post.findMany({
          where: {
            createdAt: {
              gt: itemById.createdAt,
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        });
        for (const item of items) {
          yield {
            id: item.id,
            data: item,
          } satisfies SSEChunk;
        }
      });

      for await (const [data] of ee.toIterable('add')) {
        yield {
          id: data.id,
          data,
        } satisfies SSEChunk;
      }
    }),

  whoIsTyping: publicProcedure.subscription(async function* () {
    let prev: string[] | null = null;
    for await (const _ of ee.toIterable('isTypingUpdate')) {
      if (
        !prev ||
        prev.toString() !== Object.keys(currentlyTyping).toString()
      ) {
        yield {
          data: Object.keys(currentlyTyping),
        } satisfies SSEChunk;
      }
      prev = Object.keys(currentlyTyping);
    }
  }),
});
