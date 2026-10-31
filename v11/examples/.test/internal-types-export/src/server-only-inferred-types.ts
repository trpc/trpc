/**
 * Exported values whose inferred types reference declarations that are only
 * re-exported from `@trpc/server/unstable-core-do-not-import`.
 * This file must not import from `@trpc/client` (or anything else that pulls in
 * `@trpc/server/unstable-core-do-not-import`) for the test to be valid.
 * @see https://github.com/trpc/trpc/issues/6998
 */
import { initTRPC, tracked } from '@trpc/server';

export const t = initTRPC.create({
  errorFormatter: ({ shape }) => ({ ...shape, extra: true }),
});

export const trackedSubscription = t.procedure.subscription(async function* () {
  yield tracked('1', { x: 1 });
});
