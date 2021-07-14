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
      return post;
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
  // update
  // .mutation('edit', {
  //   input: z.object({
  //     id: z.string().uuid(),
  //     data: z.object({
  //       name: z.string().min(1).max(32).optional(),
  //       text: z.string().min(1).optional(),
  //     }),
  //   }),
  //   async resolve({ ctx, input }) {
  //     const { id, data } = input;
  //     const post = await ctx.prisma.post.update({
  //       where: { id },
  //       data,
  //     });
  //     return post;
  //   },
  // })
  // delete
  // .mutation('delete', {
  //   input: z.string().uuid(),
  //   async resolve({ input: id, ctx }) {
  //     await ctx.prisma.post.delete({ where: { id } });
  //     return id;
  //   },
  // })
  .subscription('events', {
    async resolve() {
      return new Subscription<{
        type: 'add';
        data: Post;
      }>((emit) => {
        const onAdd = (data: Post) => emit.data({ type: 'add', data });
        ee.on('add', onAdd);
        return () => {
          ee.off('add', onAdd);
        };
      });
    },
  });
