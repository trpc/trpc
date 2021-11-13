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
      const router31 = await ctx.prisma.router31.create({
        data: input,
      });
      return router31;
    },
  })
  // read
  .query('all', {
    async resolve({ ctx }) {
      /**
       * For pagination you can have a look at this docs site
       * @link https://trpc.io/docs/useInfiniteQuery
       */

      return ctx.prisma.router31.findMany({
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
      const router31 = await ctx.prisma.router31.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          text: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!router31) {
        throw new TRPCError({
          code: 'NOT_FOUND',
        });
      }
      return router31;
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
      const router31 = await ctx.prisma.router31.update({
        where: { id },
        data,
      });
      return router31;
    },
  })
  // delete
  .mutation('delete', {
    input: z.string().uuid(),
    async resolve({ input: id, ctx }) {
      await ctx.prisma.router31.delete({ where: { id } });
      return { id };
    },
  });

export const router31Router = createRouter().merge('router31.', router);

export type Router31Router = typeof router31Router;