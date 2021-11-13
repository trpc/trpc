import { createRouter } from 'server/createRouter';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
const router = createRouter()
  // create
  .mutation('add', {
    input: z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(32),
      text: z.string().min(1),
    }),
    async resolve({ ctx, input }) {
      const animal = await ctx.prisma.animal.create({
        data: input,
      });
      return animal;
    },
  })
  // read
  .query('all', {
    async resolve({ ctx }) {
      /**
       * For pagination you can have a look at this docs site
       * @link https://trpc.io/docs/useInfiniteQuery
       */

      return ctx.prisma.animal.findMany({
        select: {
          id: true,
          title: true,
        },
      });
    },
  })
  .query('byId', {
    input: z.object({
      id: z.string(),
    }),
    async resolve({ ctx, input }) {
      const { id } = input;
      const animal = await ctx.prisma.animal.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          text: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!animal) {
        throw new TRPCError({
          code: 'NOT_FOUND',
        });
      }
      return animal;
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
      const animal = await ctx.prisma.animal.update({
        where: { id },
        data,
      });
      return animal;
    },
  })
  // delete
  .mutation('delete', {
    input: z.string().uuid(),
    async resolve({ input: id, ctx }) {
      await ctx.prisma.animal.delete({ where: { id } });
      return { id };
    },
  });

export const animalRouter = createRouter().merge('animal.', router);

export type AnimalRouter = typeof animalRouter;