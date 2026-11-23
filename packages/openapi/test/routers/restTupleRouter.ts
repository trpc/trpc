import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

// A rest element repeats after the fixed prefix.
type TrailingRest = [string, ...number[]];
// An optional fixed element before a rest stays optional.
type OptionalThenRest = [string, number?, ...boolean[]];
// A leading rest cannot be expressed as a position in JSON Schema.
type LeadingRest = [...string[], number];
// Control: a tuple without rest keeps its exact length.
type StrictPair = [string, number];

export const RestTupleRouter = t.router({
  trailingRest: t.procedure.query((): TrailingRest => ['hello', 1, 2, 3]),

  optionalThenRest: t.procedure.query((): OptionalThenRest => [
    'hello',
    1,
    true,
  ]),

  leadingRest: t.procedure.query((): LeadingRest => ['a', 'b', 1]),

  strictPair: t.procedure.query((): StrictPair => ['hello', 1]),
});

export type RestTupleRouter = typeof RestTupleRouter;
