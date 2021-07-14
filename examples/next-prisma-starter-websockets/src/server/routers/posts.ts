/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */

import { z } from 'zod';
import { createRouter } from '../trpc';
import { EventEmitter } from 'events';
import { Subscription } from '@trpc/server';
import { Post } from '@prisma/client';

interface MyEvents {
  add: (data: Post) => void;
  isTypingUpdate: () => void;
}
declare interface MyEventEmitter {
  on<U extends keyof MyEvents>(event: U, listener: MyEvents[U]): this;
  once<U extends keyof MyEvents>(event: U, listener: MyEvents[U]): this;
  emit<U extends keyof MyEvents>(
    event: U,
    ...args: Parameters<MyEvents[U]>
  ): boolean;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class MyEventEmitter extends EventEmitter {}

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

export const postsRouter = createRouter()
  // create
  .mutation('add', {
    input: z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(32),
      text: z.string().min(1),
    }),
    async resolve({ ctx, input }) {
      const post = await ctx.prisma.post.create({
        data: input,
      });
      ee.emit('add', post);
      delete currentlyTyping[input.name];
      ee.emit('isTypingUpdate');
      return post;
    },
  })
  .mutation('isTyping', {
    input: z.object({
      name: z.string().min(1),
      typing: z.boolean(),
    }),
    resolve({ input }) {
      if (!input.typing) {
        delete currentlyTyping[input.name];
      } else {
        currentlyTyping[input.name] = {
          lastTyped: new Date(),
        };
      }
      ee.emit('isTypingUpdate');
    },
  })
  .query('infinite', {
    input: z
      .object({
        cursor: z.date().optional(),
        take: z.number().min(1).max(50).optional(),
      })
      .optional(),
    async resolve({ input, ctx }) {
      const { take = 10, cursor } = input ?? {};
      // `cursor` is of type `Date | undefined`
      // `take` is of type `number | undefined`
      const page = await ctx.prisma.post.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        cursor: cursor
          ? {
              createdAt: cursor,
            }
          : undefined,
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
    },
  })
  .subscription('onAdd', {
    resolve() {
      return new Subscription<Post>((emit) => {
        const onAdd = (data: Post) => emit.data(data);
        ee.on('add', onAdd);
        return () => {
          ee.off('add', onAdd);
        };
      });
    },
  })
  .subscription('whoIsTyping', {
    resolve() {
      let prev: string[] | null = null;
      return new Subscription<string[]>((emit) => {
        const onIsTypingUpdate = () => {
          const newData = Object.keys(currentlyTyping);

          if (!prev || prev.toString() !== newData.toString()) {
            emit.data(newData);
          }
          prev = newData;
        };
        ee.on('isTypingUpdate', onIsTypingUpdate);
        return () => {
          ee.off('isTypingUpdate', onIsTypingUpdate);
        };
      });
    },
  });
