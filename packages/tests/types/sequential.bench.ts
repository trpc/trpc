import { bench } from '@ark/attest';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { type } from 'arktype';
import { z } from 'zod';

const t = initTRPC.create();

bench.baseline(() => {
  const router = t.router({
    baseline: t.procedure
      .input(
        z.object({
          baseline: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.baseline}`),
    arkBaseline: t.procedure
      .input(
        type({
          baseline: 'string',
        }),
      )
      .query(({ input }) => `hello ${input.baseline}`),
  });
});

const base = z.object({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});

bench('non-sequential Zod type', async () => {
  const nonSequentialRouter = t.router({
    query1: t.procedure.input(base).query(({ input }) => `hello ${input.a}`),
    mutation1: t.procedure
      .input(base)
      .mutation(({ input }) => `hello ${input.a}`),
  });

  // this is relatively cheap
}).types([1659, 'instantiations']);

// even though sequential is totally equivalent to nonSequential, its
// Zod representation is not reduced and still includes intermediate operations
const sequential = base
  .partial()
  .merge(base)
  .pick({ a: true, b: true, c: true })
  .omit({})
  .merge(base);

const base2 = z.object({
  d: z.string(),
  e: z.string(),
  f: z.string(),
});

bench('isolated sequential zod', () => {
  const sequential = base2
    .partial()
    .merge(base2)
    .pick({ d: true, e: true, f: true })
    .omit({})
    .merge(base2);
  // this is expensive
}).types([11420, 'instantiations']);

bench('sequential Zod type', async () => {
  const sequentialRouter = t.router({
    query1: t.procedure
      .input(sequential)
      .query(({ input }) => `hello ${input.a}`),
    mutation1: t.procedure
      .input(sequential)
      .mutation(({ input }) => `hello ${input.a}`),
  });

  // but it's in combination with trpc that these sequentially evaluated
  // Zod types get out of control. instead of incurring a 1-time evaluation
  // cost, it seems it can't be cached and the extra inference cost
  // is incurred multiple times (even worse with deepPartial)
}).types([49173, 'instantiations']);

const arkBase = type({
  a: 'string',
  b: 'string',
  c: 'string',
});

bench('non-sequential arktype', async () => {
  const sequentialRouter = t.router({
    query1: t.procedure.input(arkBase).query(({ input }) => `hello ${input.a}`),
    mutation1: t.procedure
      .input(arkBase)
      .mutation(({ input }) => `hello ${input.a}`),
  });

  // realtively cheap
}).types([2961, 'instantiations']);

const arkBase2 = type({
  d: 'string',
  e: 'string',
  f: 'string',
});

bench('isolated sequential arktype', () => {
  arkBase2.partial().merge(arkBase2).pick('d', 'e', 'f').omit().merge(arkBase2);
  // these kind of operations are much cheaper in ArkType than Zod
}).types([2336, 'instantiations']);

const arkSequential = arkBase
  .partial()
  .merge(arkBase)
  .pick('a', 'b', 'c')
  .omit()
  .merge(arkBase);

bench('sequential arktype', async () => {
  const sequentialRouter = t.router({
    query1: t.procedure
      .input(arkSequential)
      .query(({ input }) => `hello ${input.a}`),
    mutation1: t.procedure
      .input(arkSequential)
      .mutation(({ input }) => `hello ${input.a}`),
  });

  // even though hovering arkSequential is identical to hovering arkBase,
  // TS still seems to do a lot of repeated work inferring it somehow (though less than Zod)
}).types([17906, 'instantiations']);

// If ProcedureBuilder input updated to StandardSchemaV1 only:

//   input<$In, $Out extends object>(
//     schema: StandardSchemaV1<$In, $Out>,
//   ): ProcedureBuilder<
//     TContext,
//     TMeta,
//     TContextOverrides,
//     IntersectIfDefined<TInputIn, $In>,
//     IntersectIfDefined<TInputOut, $Out>,
//     TOutputIn,
//     TOutputOut,
//     TCaller
//   >;

// 🏌️  sequential Zod type
// ⛳ Result: 15127 instantiations
// 🎯 Baseline: 49173 instantiations
// 📉 sequential Zod type was under baseline by 69.24%! Consider setting a new baseline.

// 🏌️  sequential arktype
// ⛳ Result: 10634 instantiations
// 🎯 Baseline: 17906 instantiations
// 📉 sequential arktype was under baseline by 40.61%! Consider setting a new baseline.

// This strategy could potentially be expanded to include other schema types while still
// avoiding some of the additional re-evaluation instantiations.

// This also may be worth bringing up with the TS team, as especially in the ArkType
// case where the types appear identical on hover, it feels it should not be more
// expensive to reference than if it were created directly.
