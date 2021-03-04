import * as z from 'zod';
import { createRouter } from './[trpc]';

export const todoRouter = createRouter()
  .query('all', {
    async resolve({ ctx }) {
      console.log('ctx', ctx);
      return ctx.prisma.task.findMany();
    },
  })
  .mutation('edit', {
    input: z.object({
      id: z.string().uuid(),
      data: z.object({
        completed: z.boolean().optional(),
        text: z.string().optional(),
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
    async resolve({ input: id, ctx }) {
      await ctx.task.delete({ where: { completed: true } });

      return ctx.task.findMany();
    },
  });
