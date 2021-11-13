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
      const horse = await ctx.prisma.horse.create({
        data: input,
      });
      return horse;
    },
  })
  // read
  .query('all', {
    async resolve({ ctx }) {
      /**
       * For pagination you can have a look at this docs site
       * @link https://trpc.io/docs/useInfiniteQuery
       */

      return ctx.prisma.horse.findMany({
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
      const horse = await ctx.prisma.horse.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          text: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!horse) {
        throw new TRPCError({
          code: 'NOT_FOUND',
        });
      }
      return horse;
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
      const horse = await ctx.prisma.horse.update({
        where: { id },
        data,
      });
      return horse;
    },
  })
  // delete
  .mutation('delete', {
    input: z.string().uuid(),
    async resolve({ input: id, ctx }) {
      await ctx.prisma.horse.delete({ where: { id } });
      return { id };
    },
  });

export const horseRouter = createRouter().merge('horse.', router);

export type HorseRouter = typeof horseRouter;