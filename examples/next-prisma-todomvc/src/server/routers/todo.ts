import { z } from 'zod';
import { prisma } from '../prisma';
import { baseProcedure, router } from '../trpc';

export const todoRouter = router({
  all: baseProcedure.query(() => {
    return prisma.task.findMany({
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
    .mutation(async ({ input }) => {
      const todo = await prisma.task.create({
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
    .mutation(async ({ input }) => {
      const { id, data } = input;
      const todo = await prisma.task.update({
        where: { id },
        data,
      });
      return todo;
    }),
  toggleAll: baseProcedure
    .input(z.object({ completed: z.boolean() }))
    .mutation(async ({ input }) => {
      await prisma.task.updateMany({
        data: { completed: input.completed },
      });
    }),
  delete: baseProcedure
    .input(z.string().uuid())
    .mutation(async ({ input: id }) => {
      await prisma.task.delete({ where: { id } });
      return id;
    }),
  clearCompleted: baseProcedure.mutation(async () => {
    await prisma.task.deleteMany({ where: { completed: true } });

    return prisma.task.findMany();
  }),
});
