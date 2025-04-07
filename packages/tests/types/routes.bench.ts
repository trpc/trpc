import { bench } from '@ark/attest';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

// baseline helps account for initialization cost
// when a package's types are first imported, which
// are generally low but enough to pollute granular
// instantiation benchmarks like this.

// if you're interested in the impact it has,
// you can try commenting out this bench.baseline
// and rerun the benches to see how instantiations change.

// important to think about caching for these kinds of
// tests- e.g. you should try to avoid reusing a
// propName within the context of a bench.

bench.baseline(() => {
  t.router({
    baseline: t.procedure
      .input(
        z.object({
          baseline: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.baseline}`),
  });
});

// types created outside the `bench` function
// like these schemas will generally already have
// been evaluated by TS by the time your bench is
// checked. here, we ensure they're fully
// evaluated bye explicitly declaring the schema types

// you can use this to isolate specific types
// you're trying to measure.

// in this case, by preinferring the schema types,
// we can the base cost of tRPC's types independent
// of the validator's performance.

// the rest of the `preinferred` schemas are at the bottom of
// the file and are all structured like this.

declare const preinferred1: z.ZodType<{
  preinferred1: string;
}>;

bench('5 simple routes (preinferred)', () => {
  t.router({
    preinferred1: t.procedure
      .input(preinferred1)
      .query(({ input }) => `hello ${input.preinferred1}`),
    preinferred2: t.procedure
      .input(preinferred2)
      .query(({ input }) => `hello ${input.preinferred2}`),
    preinferred3: t.procedure
      .input(preinferred3)
      .query(({ input }) => `hello ${input.preinferred3}`),
    preinferred4: t.procedure
      .input(preinferred4)
      .query(({ input }) => `hello ${input.preinferred4}`),
    preinferred5: t.procedure
      .input(preinferred5)
      .query(({ input }) => `hello ${input.preinferred5}`),
  });
}).types([1430, 'instantiations']);

// benchmarking the same types expanded by some factor (in this case 5)
// is useful for learning how they scale
bench('25 simple routes (preinferred)', () => {
  t.router({
    preinferred1: t.procedure
      .input(preinferred1)
      .query(({ input }) => `hello ${input.preinferred1}`),
    preinferred2: t.procedure
      .input(preinferred2)
      .query(({ input }) => `hello ${input.preinferred2}`),
    preinferred3: t.procedure
      .input(preinferred3)
      .query(({ input }) => `hello ${input.preinferred3}`),
    preinferred4: t.procedure
      .input(preinferred4)
      .query(({ input }) => `hello ${input.preinferred4}`),
    preinferred5: t.procedure
      .input(preinferred5)
      .query(({ input }) => `hello ${input.preinferred5}`),
    preinferred6: t.procedure
      .input(preinferred6)
      .query(({ input }) => `hello ${input.preinferred6}`),
    preinferred7: t.procedure
      .input(preinferred7)
      .query(({ input }) => `hello ${input.preinferred7}`),
    preinferred8: t.procedure
      .input(preinferred8)
      .query(({ input }) => `hello ${input.preinferred8}`),
    preinferred9: t.procedure
      .input(preinferred9)
      .query(({ input }) => `hello ${input.preinferred9}`),
    preinferred10: t.procedure
      .input(preinferred10)
      .query(({ input }) => `hello ${input.preinferred10}`),
    preinferred11: t.procedure
      .input(preinferred11)
      .query(({ input }) => `hello ${input.preinferred11}`),
    preinferred12: t.procedure
      .input(preinferred12)
      .query(({ input }) => `hello ${input.preinferred12}`),
    preinferred13: t.procedure
      .input(preinferred13)
      .query(({ input }) => `hello ${input.preinferred13}`),
    preinferred14: t.procedure
      .input(preinferred14)
      .query(({ input }) => `hello ${input.preinferred14}`),
    preinferred15: t.procedure
      .input(preinferred15)
      .query(({ input }) => `hello ${input.preinferred15}`),
    preinferred16: t.procedure
      .input(preinferred16)
      .query(({ input }) => `hello ${input.preinferred16}`),
    preinferred17: t.procedure
      .input(preinferred17)
      .query(({ input }) => `hello ${input.preinferred17}`),
    preinferred18: t.procedure
      .input(preinferred18)
      .query(({ input }) => `hello ${input.preinferred18}`),
    preinferred19: t.procedure
      .input(preinferred19)
      .query(({ input }) => `hello ${input.preinferred19}`),
    preinferred20: t.procedure
      .input(preinferred20)
      .query(({ input }) => `hello ${input.preinferred20}`),
    preinferred21: t.procedure
      .input(preinferred21)
      .query(({ input }) => `hello ${input.preinferred21}`),
    preinferred22: t.procedure
      .input(preinferred22)
      .query(({ input }) => `hello ${input.preinferred22}`),
    preinferred23: t.procedure
      .input(preinferred23)
      .query(({ input }) => `hello ${input.preinferred23}`),
    preinferred24: t.procedure
      .input(preinferred24)
      .query(({ input }) => `hello ${input.preinferred24}`),
    preinferred25: t.procedure
      .input(preinferred25)
      .query(({ input }) => `hello ${input.preinferred25}`),
  });
  // scaling is linear- great!
  // if it's ever less than linear, you likely want to double
  // check that your example doesn't reuse cacheable types.
}).types([7070, 'instantiations']);

bench('5 simple routes (zod)', () => {
  t.router({
    arpc: t.procedure
      .input(
        z.object({
          arpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.arpc}`),
    brpc: t.procedure
      .input(
        z.object({
          brpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.brpc}`),
    crpc: t.procedure
      .input(
        z.object({
          crpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.crpc}`),
    drpc: t.procedure
      .input(
        z.object({
          drpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.drpc}`),
    erpc: t.procedure
      .input(
        z.object({
          erpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.erpc}`),
  });
  // for objects with one string property, it looks like
  // about half of the inference overhead comes from zod.
}).types([3010, 'instantiations']);

bench('25 simple routes (zod)', () => {
  t.router({
    // it's okay to reuse prop names from another bench because benches
    // are automatically isolated from one another when instantiations
    // are evaluated in attest.
    arpc: t.procedure
      .input(
        z.object({
          arpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.arpc}`),
    brpc: t.procedure
      .input(
        z.object({
          brpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.brpc}`),
    crpc: t.procedure
      .input(
        z.object({
          crpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.crpc}`),
    drpc: t.procedure
      .input(
        z.object({
          drpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.drpc}`),
    erpc: t.procedure
      .input(
        z.object({
          erpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.erpc}`),
    frpc: t.procedure
      .input(
        z.object({
          frpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.frpc}`),
    grpc: t.procedure
      .input(
        z.object({
          grpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.grpc}`),
    hrpc: t.procedure
      .input(
        z.object({
          hrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.hrpc}`),
    irpc: t.procedure
      .input(
        z.object({
          irpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.irpc}`),
    jrpc: t.procedure
      .input(
        z.object({
          jrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.jrpc}`),
    krpc: t.procedure
      .input(
        z.object({
          krpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.krpc}`),
    lrpc: t.procedure
      .input(
        z.object({
          lrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.lrpc}`),
    mrpc: t.procedure
      .input(
        z.object({
          mrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.mrpc}`),
    nrpc: t.procedure
      .input(
        z.object({
          nrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.nrpc}`),
    orpc: t.procedure
      .input(
        z.object({
          orpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.orpc}`),
    prpc: t.procedure
      .input(
        z.object({
          prpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.prpc}`),
    qrpc: t.procedure
      .input(
        z.object({
          qrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.qrpc}`),
    rrpc: t.procedure
      .input(
        z.object({
          rrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.rrpc}`),
    srpc: t.procedure
      .input(
        z.object({
          srpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.srpc}`),
    // this one feels special
    trpc: t.procedure
      .input(
        z.object({
          trpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.trpc}`),
    urpc: t.procedure
      .input(
        z.object({
          urpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.urpc}`),
    vrpc: t.procedure
      .input(
        z.object({
          vrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.vrpc}`),
    wrpc: t.procedure
      .input(
        z.object({
          wrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.wrpc}`),
    xrpc: t.procedure
      .input(
        z.object({
          xrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.xrpc}`),
    yrpc: t.procedure
      .input(
        z.object({
          yrpc: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.yrpc}`),
  });
  // scaling is still linear- good
}).types([14970, 'instantiations']);

declare const preinferred2: z.ZodType<{
  preinferred2: string;
}>;

declare const preinferred3: z.ZodType<{
  preinferred3: string;
}>;

declare const preinferred4: z.ZodType<{
  preinferred4: string;
}>;

declare const preinferred5: z.ZodType<{
  preinferred5: string;
}>;

declare const preinferred6: z.ZodType<{
  preinferred6: string;
}>;

declare const preinferred7: z.ZodType<{
  preinferred7: string;
}>;

declare const preinferred8: z.ZodType<{
  preinferred8: string;
}>;

declare const preinferred9: z.ZodType<{
  preinferred9: string;
}>;

declare const preinferred10: z.ZodType<{
  preinferred10: string;
}>;

declare const preinferred11: z.ZodType<{
  preinferred11: string;
}>;

declare const preinferred12: z.ZodType<{
  preinferred12: string;
}>;

declare const preinferred13: z.ZodType<{
  preinferred13: string;
}>;

declare const preinferred14: z.ZodType<{
  preinferred14: string;
}>;

declare const preinferred15: z.ZodType<{
  preinferred15: string;
}>;

declare const preinferred16: z.ZodType<{
  preinferred16: string;
}>;

declare const preinferred17: z.ZodType<{
  preinferred17: string;
}>;

declare const preinferred18: z.ZodType<{
  preinferred18: string;
}>;

declare const preinferred19: z.ZodType<{
  preinferred19: string;
}>;

declare const preinferred20: z.ZodType<{
  preinferred20: string;
}>;

declare const preinferred21: z.ZodType<{
  preinferred21: string;
}>;

declare const preinferred22: z.ZodType<{
  preinferred22: string;
}>;

declare const preinferred23: z.ZodType<{
  preinferred23: string;
}>;

declare const preinferred24: z.ZodType<{
  preinferred24: string;
}>;

declare const preinferred25: z.ZodType<{
  preinferred25: string;
}>;
