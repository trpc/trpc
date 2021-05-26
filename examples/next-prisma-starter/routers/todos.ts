/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */

import { z } from 'zod';
import { createRouter } from '../pages/api/trpc/[trpc]';

export const todosRouter = createRouter()
  // create
  .mutation('add', {
    input: z.object({
      text: z.string().min(1),
    }),
    async resolve({ ctx, input }) {
      const todo = await ctx.prisma.task.create({
        data: input,
      });
      return todo;
    },
  })
  // read
  .query('all', {
    async resolve({ ctx }) {
      return ctx.prisma.task.findMany({
        // orderBy: {
        //   createdAt: 'asc',
        // },
      });
    },
  })
  .query('byId', {
    input: z.string(),
    async resolve({ ctx, input }) {
      return ctx.prisma.task.findUnique({
        where: { id: input },
      });
    },
  })
  // update
  .mutation('edit', {
    input: z.object({
      id: z.string().uuid(),
      data: z.object({
        completed: z.boolean().optional(),
        text: z.string().min(1).optional(),
      }),
    }),
    async resolve({ ctx, input }) {
      const { id, data } = input;
      const todo = await ctx.prisma.task.update({
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
      await ctx.prisma.task.delete({ where: { id } });
      return id;
    },
  });
