import { TRPCError } from '@trpc/server';
import { Currency, dinero } from 'dinero.js';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  demoProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from './trpc';

const USD: Currency<number> = {
  code: 'USD',
  base: 10,
  exponent: 2,
};

export const appRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx?.user),

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
        const products = await ctx.db
          .selectFrom('Product')
          .leftJoin('Discount', 'Product.discountId', 'Discount.id')
          .select([
            'Product.id',
            'Product.createdAt',
            'Product.name',
            'Product.description',
            'Product.price',
            'Product.image',
            'Product.rating',
            'Product.isBestSeller',
            'Product.stock',
            'Product.leadTime',
            'Discount.id as discountId',
            'Discount.percent',
            'Discount.expiresAt',
          ])
          .$if(!!input?.filter, (q) =>
            q.where('Product.id', '!=', input?.filter as string),
          )
          .execute();

        return products.map((p) => ({
          ...p,
          discount: p.discountId
            ? {
                id: p.discountId,
                percent: p.percent,
                expires: p.expiresAt,
              }
            : null,
          price: dinero({ amount: p.price, currency: USD }),
        }));
      }),

    byId: demoProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        console.log({ input });
        const product = await ctx.db
          .selectFrom('Product')
          .leftJoin('Discount', 'Product.discountId', 'Discount.id')
          .select([
            'Product.id',
            'Product.createdAt',
            'Product.name',
            'Product.description',
            'Product.price',
            'Product.image',
            'Product.rating',
            'Product.isBestSeller',
            'Product.stock',
            'Product.leadTime',
            'Discount.id as discountId',
            'Discount.percent',
            'Discount.expiresAt',
          ])
          .where('Product.id', '=', input.id)
          .executeTakeFirst();

        if (!product) throw new TRPCError({ code: 'NOT_FOUND' });
        return {
          ...product,
          discount: product.discountId
            ? {
                id: product.discountId,
                percent: product.percent,
                expires: product.expiresAt,
              }
            : null,
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
        const product = await ctx.db
          .selectFrom('Product')
          .selectAll()
          .where('Product.id', '=', input.productId)
          .executeTakeFirst();

        if (!product) throw new TRPCError({ code: 'NOT_FOUND' });

        const id = nanoid();
        await ctx.db
          .insertInto('Review')
          .values({
            id,
            productId: input.productId,
            userId: ctx.user.id,
            comment: input.text,
            rating: input.rating,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .executeTakeFirst();

        return await ctx.db
          .selectFrom('Review')
          .selectAll()
          .where('Review.id', '=', id)
          .executeTakeFirst();
      }),

    list: demoProcedure
      .input(z.object({ productId: z.string() }))
      .query(async ({ ctx, input }) => {
        const reviews = await ctx.db
          .selectFrom('Review')
          .leftJoin('User', 'Review.userId', 'User.id')
          .selectAll()
          .where('Review.productId', '=', input.productId)
          .orderBy('Review.createdAt', 'desc')
          .execute();
        return reviews.map((r) => ({
          ...r,
          user: {
            id: r.userId,
            name: r.name,
            email: r.email,
            image: r.image,
          },
        }));
      }),
  }),
});

export type AppRouter = typeof appRouter;
