/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */

import { z } from 'zod';
import { createRouter } from '../trpc';
import { EventEmitter } from 'events';
import { Subscription } from '@trpc/server';
const ee = new EventEmitter();
export const postsRouter = createRouter()
  // create
  .mutation('add', {
    input: z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(32),
      text: z.string().min(1),
    }),
    async resolve({ ctx, input }) {
      const todo = await ctx.prisma.post.create({
        data: input,
      });
      ee.emit('updated');
      return todo;
    },
  })
  // read
  .query('all', {
    async resolve({ ctx }) {
      /**
       * For pagination you can have a look at this docs site
       * @link https://trpc.io/docs/useInfiniteQuery
       */

      return ctx.prisma.post.findMany();
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
  .query('byId', {
    input: z.string(),
    async resolve({ ctx, input }) {
      return ctx.prisma.post.findUnique({
        where: { id: input },
      });
    },
  })
  // update
  .mutation('edit', {
    input: z.object({
      id: z.string().uuid(),
      data: z.object({
        name: z.string().min(1).max(32).optional(),
        text: z.string().min(1).optional(),
      }),
    }),
    async resolve({ ctx, input }) {
      const { id, data } = input;
      const todo = await ctx.prisma.post.update({
        where: { id },
        data,
      });
      ee.emit('updated');
      return todo;
    },
  })
  // delete
  .mutation('delete', {
    input: z.string().uuid(),
    async resolve({ input: id, ctx }) {
      await ctx.prisma.post.delete({ where: { id } });
      ee.emit('updated');
      return id;
    },
  })
  .subscription('updated', {
    async resolve() {
      return new Subscription<'updated'>({
        start(emit) {
          const updated = () => emit.data('updated');
          ee.on('updated', updated);
          return () => {
            ee.off('updated', updated);
          };
        },
      });
    },
  });
