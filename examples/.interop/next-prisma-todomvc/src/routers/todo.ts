import { z } from 'zod';
import { createRouter } from '../pages/api/trpc/[trpc]';

export const todoRouter = createRouter()
  .query('all', {
    async resolve({ ctx }) {
      return ctx.task.findMany({
        orderBy: {
          createdAt: 'asc',
        },
      });
    },
  })
  .mutation('add', {
    input: z.object({
      id: z.string().optional(),
      text: z.string().min(1),
    }),
    async resolve({ ctx, input }) {
      const todo = await ctx.task.create({
        data: input,
      });
      return todo;
    },
  })
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
      const todo = await ctx.task.update({
        where: { id },
        data,
      });
      return todo;
    },
  })
  .mutation('delete', {
    input: z.string().uuid(),
    async resolve({ input: id, ctx }) {
      await ctx.task.delete({ where: { id } });
      return id;
    },
  })
  .mutation('clearCompleted', {
    async resolve({ ctx }) {
      await ctx.task.deleteMany({ where: { completed: true } });

      return ctx.task.findMany();
    },
  });
