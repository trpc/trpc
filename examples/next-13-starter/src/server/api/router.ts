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

  products: router({
    // create: protectedProcedure
    //   .input(z.object({}))
    //   .mutation(async ({ ctx }) => {}),

    list: demoProcedure
      .input(z.object({ filter: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const query = ctx.db
          .selectFrom('Product')
          .leftJoin('Discount', 'Product.discountId', 'Discount.id')
          .select([
            'Product.id',
            'Product.name',
            'Product.description',
            'Product.price',
            'Product.image',
            'Product.rating',
            'Product.isBestSeller',
            'Product.stock',
            'Product.leadTime',
            'Product.discountId',
            'Discount.percent',
            'Discount.expiresAt',
          ]);
        const products = !!input?.filter
          ? await query.where('Product.id', '!=', input?.filter).execute()
          : await query.execute();

        return products.map(
          ({ discountId, percent, expiresAt, ...product }) => ({
            ...product,
            discount: discountId
              ? {
                  id: discountId,
                  percent: percent,
                  expires: expiresAt,
                }
              : null,
            price: dinero({ amount: product.price, currency: USD }),
          }),
        );
      }),

    byId: demoProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const result = await ctx.db
          .selectFrom('Product')
          .leftJoin('Discount', 'Product.discountId', 'Discount.id')
          .select([
            'Product.id',
            'Product.name',
            'Product.description',
            'Product.price',
            'Product.image',
            'Product.rating',
            'Product.isBestSeller',
            'Product.stock',
            'Product.leadTime',
            'Product.discountId',
            'Discount.percent',
            'Discount.expiresAt',
          ])
          .where('Product.id', '=', input.id)
          .executeTakeFirst();

        if (!result) throw new TRPCError({ code: 'NOT_FOUND' });

        const { discountId, percent, expiresAt, ...product } = result;
        return {
          ...product,
          discount: discountId
            ? {
                id: discountId,
                percent: percent,
                expires: expiresAt,
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
        const [product, user] = await Promise.all([
          ctx.db
            .selectFrom('Product')
            .select(['Product.id'])
            .where('Product.id', '=', input.productId)
            .executeTakeFirst(),
          ctx.db
            .selectFrom('User')
            .selectAll()
            .where('User.id', '=', ctx.user.id)
            .executeTakeFirst(),
        ]);

        if (!product) throw new TRPCError({ code: 'NOT_FOUND' });
        if (!user) {
          await ctx.db
            .insertInto('User')
            .values({
              id: ctx.user.id,
              name: ctx.user.name,
              email: ctx.user.email,
              image: ctx.user.image,
            })
            .executeTakeFirstOrThrow();
        }

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
          .select([
            'Review.id',
            'Review.comment',
            'Review.rating',
            'Review.createdAt',
            'Review.userId',
          ])
          .where('Review.id', '=', id)
          .executeTakeFirst();
      }),

    list: demoProcedure
      .input(z.object({ productId: z.string() }))
      .query(async ({ ctx, input }) => {
        const reviews = await ctx.db
          .selectFrom('Review')
          .leftJoin('User', 'Review.userId', 'User.id')
          .select([
            'Review.id',
            'Review.comment',
            'Review.rating',
            'Review.createdAt',
            'Review.userId',
            'User.name',
            'User.image',
          ])
          .where('Review.productId', '=', input.productId)
          .orderBy('Review.createdAt', 'desc')
          .execute();
        return reviews.map(({ userId, name, image, ...review }) => ({
          ...review,
          user: {
            id: userId,
            name: name,
            image: image,
          },
        }));
      }),
  }),
});

export type AppRouter = typeof appRouter;
