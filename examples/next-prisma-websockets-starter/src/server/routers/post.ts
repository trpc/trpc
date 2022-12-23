/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */
import { Post } from '@prisma/client';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';
import { prisma } from '../prisma';
import { z } from 'zod';
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

class MyEventEmitter extends EventEmitter {}

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
process.on('SIGTERM', () => clearInterval(interval));

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
      let prevCursor: null | typeof cursor = null;
      if (items.length > take) {
        const prev = items.shift();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        prevCursor = prev!.createdAt;
      }
      return {
        items,
        prevCursor,
      };
    }),

  onAdd: publicProcedure.subscription(() => {
    return observable<Post>((emit) => {
      const onAdd = (data: Post) => emit.next(data);
      ee.on('add', onAdd);
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

        if (!prev || prev.toString() !== newData.toString()) {
          emit.next(newData);
        }
        prev = newData;
      };
      ee.on('isTypingUpdate', onIsTypingUpdate);
      return () => {
        ee.off('isTypingUpdate', onIsTypingUpdate);
      };
    });
  }),
});
