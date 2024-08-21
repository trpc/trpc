import type { inferProcedureOutput, inferRouterOutputs } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import type { inferTransformedProcedureOutput } from '@trpc/server/unstable-core-do-not-import';
import SuperJSON from 'superjson';
import { z } from 'zod';

test('infer json-esque', async () => {
  const t = initTRPC.create();
  type $Types = (typeof t)['_config']['$types'];
  const helloProcedure = t.procedure.input(z.string()).query(() => {
    return {
      hello: Math.random() > 0.5 ? 'hello' : undefined,
    };
  });

  {
    type Inferred = inferProcedureOutput<typeof helloProcedure>;
    expectTypeOf<Inferred>().toEqualTypeOf<{ hello: string | undefined }>();
  }
  {
    // This type is what the client will receive
    // Because it will be sent as JSON, the undefined will be stripped by `JSON.stringify`
    // Example: JSON.stringify({ hello: undefined }) === '{}'
    type Inferred = inferTransformedProcedureOutput<
      $Types,
      typeof helloProcedure
    >;
    expectTypeOf<Inferred>().toEqualTypeOf<{ hello?: string }>();
  }
});

test('infer with superjson', async () => {
  const t = initTRPC.create({
    transformer: SuperJSON,
  });
  type $Types = (typeof t)['_config']['$types'];
  const helloProcedure = t.procedure.input(z.string()).query(() => {
    return {
      hello: Math.random() > 0.5 ? 'hello' : undefined,
    };
  });

  {
    type Inferred = inferProcedureOutput<typeof helloProcedure>;
    expectTypeOf<Inferred>().toEqualTypeOf<{ hello: string | undefined }>();
  }
  {
    // This type is what the client will receive
    // Here, we use a transformer which will handle preservation of undefined
    type Inferred = inferTransformedProcedureOutput<
      $Types,
      typeof helloProcedure
    >;
    expectTypeOf<Inferred>().toEqualTypeOf<{ hello: string | undefined }>();
  }
});

test('inference helpers', async () => {
  const t = initTRPC.create();
  const helloProcedure = t.procedure.input(z.string()).query(() => {
    return {
      hello: Math.random() > 0.5 ? 'hello' : undefined,
    };
  });
  const router = t.router({
    hello: helloProcedure,
  });
  type Outputs = inferRouterOutputs<typeof router>;
  expectTypeOf<Outputs['hello']>().toEqualTypeOf<{ hello?: string }>();
});
