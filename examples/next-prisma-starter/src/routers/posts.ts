/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */

import { z } from 'zod';
import { createRouter } from './utils/createRouter';

export const postsRouter = createRouter()
  // create
  .mutation('add', {
    input: z.object({
      title: z.string().min(1).max(32),
      text: z.string().min(1),
    }),
    async resolve({ ctx, input }) {
      const todo = await ctx.prisma.post.create({
        data: input,
      });
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
        title: z.string().min(1).max(32).optional(),
        text: z.string().min(1).optional(),
      }),
    }),
    async resolve({ ctx, input }) {
      const { id, data } = input;
      const todo = await ctx.prisma.post.update({
        where: { id },
        data,
      });
      return todo;
    },
  })
  // delete
  .mutation('delete', {
    input: z.string().uuid(),
    async resolve({ input: id, ctx }) {
      await ctx.prisma.post.delete({ where: { id } });
      return id;
    },
  });
