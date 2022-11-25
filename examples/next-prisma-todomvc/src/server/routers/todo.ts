import { z } from 'zod';
import { baseProcedure, router } from '../trpc';

export const todoRouter = router({
  all: baseProcedure.query(({ ctx }) => {
    return ctx.task.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });
  }),
  add: baseProcedure
    .input(
      z.object({
        id: z.string().optional(),
        text: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const todo = await ctx.task.create({
        data: input,
      });
      return todo;
    }),
  edit: baseProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: z.object({
          completed: z.boolean().optional(),
          text: z.string().min(1).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, data } = input;
      const todo = await ctx.task.update({
        where: { id },
        data,
      });
      return todo;
    }),
  delete: baseProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input: id }) => {
      await ctx.task.delete({ where: { id } });
      return id;
    }),
  clearCompleted: baseProcedure.mutation(async ({ ctx }) => {
    await ctx.task.deleteMany({ where: { completed: true } });

    return ctx.task.findMany();
  }),
});
