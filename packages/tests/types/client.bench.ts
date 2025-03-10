import { bench } from '@ark/attest';
import { createTRPCClient } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
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
  });

  // we want to include a simple createTRPCClient in the baseline as well,
  // making sure the router we pass to it doesn't have the same shape
  // as the one we're testing.

  createTRPCClient<typeof router>({
    links: [],
  });

  createTRPCReact<typeof router>().createClient({ links: [] });
});

// now that we're trying to isolate the performance of
// createTRPCClient, we can move the router inference to
// the top-level of the module

const router5 = t.router({
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

bench('create and query 5 simple routes', async () => {
  const client = createTRPCClient<typeof router5>({
    links: [],
  });

  await client.arpc.query({ arpc: 'test' });
  await client.brpc.query({ brpc: 'test' });
  await client.crpc.query({ crpc: 'test' });
  await client.drpc.query({ drpc: 'test' });
  await client.erpc.query({ erpc: 'test' });
  // this is an extremely low instantiation count
  // for several queries, which is consistent with
  // router and most client methods having very
  // efficient types in the repos we traced.
}).types([1318, 'instantiations']);

bench('create and query 5 simple routes (react)', async () => {
  const hooks = createTRPCReact<typeof router5>({});

  const client = hooks.createClient({ links: [] });

  await client.arpc.query({ arpc: 'test' });
  await client.brpc.query({ brpc: 'test' });
  await client.crpc.query({ crpc: 'test' });
  await client.drpc.query({ drpc: 'test' });
  await client.erpc.query({ erpc: 'test' });
  // the overhead is almost nothing compared to the base
  // `createTRPCClient` call.
  // could try adding additional options you believe
  // are likely to add overhead and retest.
}).types([1358, 'instantiations']);

const router25 = t.router({
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

bench('create and query 25 simple routes', async () => {
  const client = createTRPCClient<typeof router25>({
    links: [],
  });

  await client.arpc.query({ arpc: 'test' });
  await client.brpc.query({ brpc: 'test' });
  await client.crpc.query({ crpc: 'test' });
  await client.drpc.query({ drpc: 'test' });
  await client.erpc.query({ erpc: 'test' });
  await client.frpc.query({ frpc: 'test' });
  await client.grpc.query({ grpc: 'test' });
  await client.hrpc.query({ hrpc: 'test' });
  await client.irpc.query({ irpc: 'test' });
  await client.jrpc.query({ jrpc: 'test' });
  await client.krpc.query({ krpc: 'test' });
  await client.lrpc.query({ lrpc: 'test' });
  await client.mrpc.query({ mrpc: 'test' });
  await client.nrpc.query({ nrpc: 'test' });
  await client.orpc.query({ orpc: 'test' });
  await client.prpc.query({ prpc: 'test' });
  await client.qrpc.query({ qrpc: 'test' });
  await client.rrpc.query({ rrpc: 'test' });
  await client.srpc.query({ srpc: 'test' });
  await client.trpc.query({ trpc: 'test' });
  await client.urpc.query({ urpc: 'test' });
  await client.vrpc.query({ vrpc: 'test' });
  await client.wrpc.query({ wrpc: 'test' });
  await client.xrpc.query({ xrpc: 'test' });
  await client.yrpc.query({ yrpc: 'test' });
  // linear and still impressively efficient!
}).types([5038, 'instantiations']);
