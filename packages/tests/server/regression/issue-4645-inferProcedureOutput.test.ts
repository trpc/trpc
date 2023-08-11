import { inferProcedureOutput, initTRPC } from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import SuperJSON from 'superjson';
import { z } from 'zod';

test('infer json-esque', async () => {
  const t = initTRPC.create();
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
    type Inferred = inferTransformedProcedureOutput<typeof helloProcedure>;
    expectTypeOf<Inferred>().toEqualTypeOf<{ hello?: string }>();
  }
});

test('infer with superjson', async () => {
  const t = initTRPC.create({
    transformer: SuperJSON,
  });
  const helloProcedure = t.procedure.input(z.string()).query((opts) => {
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
    type Inferred = inferTransformedProcedureOutput<typeof helloProcedure>;
    expectTypeOf<Inferred>().toEqualTypeOf<{ hello: string | undefined }>();
  }
});
