import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

// Event-name style IDs built from template literal types
type UserId = `user_${string}`;
type EventName = `a_${string}` | `b_${number}`;

declare const brand: unique symbol;
type BrandedUserId = UserId & { readonly [brand]: 'UserId' };

export const TemplateLiteralRouter = t.router({
  userId: t.procedure.query((): UserId => 'user_42'),

  eventName: t.procedure.query((): EventName => 'a_x'),

  branded: t.procedure.query((): BrandedUserId => 'user_42' as BrandedUserId),
});

export type TemplateLiteralRouter = typeof TemplateLiteralRouter;
