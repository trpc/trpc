import { TRPCError } from '@trpc/server';
import { Currency, dinero } from 'dinero.js';
import { z } from 'zod';
import { demoProcedure, protectedProcedure, router } from './trpc';

const USD: Currency<number> = {
  code: 'USD',
  base: 10,
  exponent: 2,
};

export const appRouter = router({
  greeting: demoProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return `hello ${input.text}`;
    }),

  products: router({
    // create: protectedProcedure
    //   .input(z.object({}))
    //   .mutation(async ({ ctx }) => {}),

    list: demoProcedure
      .input(z.object({ filter: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const products = await ctx.prisma.product.findMany({
          ...(input?.filter ? { where: { id: { not: input.filter } } } : {}),
          include: { discount: true },
        });

        return products.map((p) => ({
          ...p,
          price: dinero({ amount: p.price, currency: USD }),
        }));
      }),

    byId: demoProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const product = await ctx.prisma.product.findUnique({
          where: { id: input.id },
          include: { discount: true },
        });
        if (!product) throw new TRPCError({ code: 'NOT_FOUND' });
        return {
          ...product,
          price: dinero({ amount: product.price, currency: USD }),
        };
      }),
  }),

  reviews: router({
    create: protectedProcedure
      .input(
        z.object({
          productId: z.string(),
          text: z.string(),
          rating: z.number().min(1).max(5),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const product = await ctx.prisma.product.findUnique({
          where: { id: input.productId },
        });
        if (!product) throw new TRPCError({ code: 'NOT_FOUND' });

        const user = ctx.session.user;

        return ctx.prisma.review.create({
          data: {
            product: {
              connect: { id: input.productId },
            },
            user: {
              connectOrCreate: {
                where: { email: user.email },
                create: {
                  name: user.name,
                  email: user.email,
                  image: user.image,
                },
              },
            },
            comment: input.text,
            rating: input.rating,
          },
        });
      }),

    list: demoProcedure.query(async ({ ctx }) => {
      return ctx.prisma.review.findMany({
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      });
    }),
  }),
});

export type AppRouter = typeof appRouter;
