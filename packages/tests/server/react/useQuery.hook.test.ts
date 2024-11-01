import type { TRPCClientErrorLike } from '@trpc/react-query';
import { createTRPCReact } from '@trpc/react-query';
import type { DecoratedQuery } from '@trpc/react-query/createTRPCReact';
import type { QueryLike, UseTRPCQueryResult } from '@trpc/react-query/shared';
import type { AnyQueryProcedure, inferProcedureInput } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

test('custom hook', () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => '__result' as const),
    }),
  });

  const trpc = createTRPCReact<typeof appRouter>();

  type Types = typeof t._config.$types;

  function useCustomHook<TInput, TOutput>(
    query: DecoratedQuery<{
      transformer: Types['transformer'];
      errorShape: Types['errorShape'];
      input: TInput;
      output: TOutput;
    }>,
    input: TInput,
  ) {
    return query.useQuery(input);
  }

  function MyComponent() {
    const query1 = trpc.post.byId.useQuery({ id: '1' });

    const result = useCustomHook(trpc.post.byId, { id: '1' });

    const data = result.data!;
    expectTypeOf(data).not.toBeAny;
    expectTypeOf(data).toEqualTypeOf<'__result'>();
  }
});

test('custom hook 2', () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => '__result' as const),
    }),
  });

  const trpc = createTRPCReact<typeof appRouter>();

  type Types = typeof t._config.$types;

  function useCustomHook<TProcedure extends AnyQueryProcedure>(
    query: QueryLike<Types, TProcedure>,
    input: inferProcedureInput<TProcedure>,
  ) {
    return query.useQuery(input) as UseTRPCQueryResult<
      '__result',
      TRPCClientErrorLike<{
        transformer: Types['transformer'];
        errorShape: Types['errorShape'];
      }>
    >;
  }

  function MyComponent() {
    const query1 = trpc.post.byId.useQuery({ id: '1' });

    const result = useCustomHook(trpc.post.byId, { id: '1' });

    const data = result.data!;
    expectTypeOf(data).not.toBeAny;
    expectTypeOf(data).toEqualTypeOf<'__result'>();
  }
});
