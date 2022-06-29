import { z } from 'zod';
import { t } from '../trpc';

export const todoRouter = t.router({
  queries: {
    todoList: t.procedure.resolve(({ ctx }) =>
      ctx.task.findMany({
        orderBy: {
          createdAt: 'asc',
        },
      }),
    ),
  },
  mutations: {
    todoAdd: t.procedure
      .input(
        z.object({
          id: z.string().optional(),
          text: z.string().min(1),
        }),
      )
      .resolve(({ ctx, input }) =>
        ctx.task.create({
          data: input,
        }),
      ),
    todoEdit: t.procedure
      .input(
        z.object({
          id: z.string().uuid(),
          data: z.object({
            completed: z.boolean().optional(),
            text: z.string().min(1).optional(),
          }),
        }),
      )
      .resolve(async ({ input, ctx }) => {
        const { id, data } = input;
        const todo = await ctx.task.update({
          where: { id },
          data,
        });
        return todo;
      }),
    todoDelete: t.procedure
      .input(z.string().uuid())
      .resolve(async ({ input, ctx }) => {
        const id = input;
        await ctx.task.delete({ where: { id } });
        return { id };
      }),
    todoClearCompleted: t.procedure.resolve(async ({ ctx }) => {
      await ctx.task.deleteMany({ where: { completed: true } });

      return ctx.task.findMany();
    }),
  },
});
