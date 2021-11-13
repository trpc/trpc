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
      const shoe = await ctx.prisma.shoe.create({
        data: input,
      });
      return shoe;
    },
  })
  // read
  .query('all', {
    async resolve({ ctx }) {
      /**
       * For pagination you can have a look at this docs site
       * @link https://trpc.io/docs/useInfiniteQuery
       */

      return ctx.prisma.shoe.findMany({
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
      const shoe = await ctx.prisma.shoe.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          text: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!shoe) {
        throw new TRPCError({
          code: 'NOT_FOUND',
        });
      }
      return shoe;
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
      const shoe = await ctx.prisma.shoe.update({
        where: { id },
        data,
      });
      return shoe;
    },
  })
  // delete
  .mutation('delete', {
    input: z.string().uuid(),
    async resolve({ input: id, ctx }) {
      await ctx.prisma.shoe.delete({ where: { id } });
      return { id };
    },
  });

export const shoeRouter = createRouter().merge('shoe.', router);

export type ShoeRouter = typeof shoeRouter;