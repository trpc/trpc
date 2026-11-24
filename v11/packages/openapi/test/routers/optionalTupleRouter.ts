import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

// Tuples whose tail elements may be absent at runtime
type PairWithOptionalMeta = [string, number?];
type PairWithExplicitUndefined = [string | undefined, number];
type StrictTriple = [string, number, boolean];

export const OptionalTupleRouter = t.router({
  pairWithOptionalMeta: t.procedure.query((): PairWithOptionalMeta => [
    'hello',
  ]),

  pairWithExplicitUndefined: t.procedure.query(
    (): PairWithExplicitUndefined => ['hello', 42],
  ),

  strictTriple: t.procedure.query((): StrictTriple => ['hello', 42, true]),
});

export type OptionalTupleRouter = typeof OptionalTupleRouter;
