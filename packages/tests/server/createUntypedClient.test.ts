import { ignoreErrors } from '@trpc/server/__tests__/suppressLogs';
import type { TRPCSubscription } from '@trpc/client';
import { createTRPCUntypedClient } from '@trpc/client';
import type { Unsubscribable } from '@trpc/server/observable';

test('loosely typed parameters', () => {
  const client = createTRPCUntypedClient({
    links: [],
  });

  ignoreErrors(async () => {
    const _arguments = [
      'foo',
      { bar: 1 },
      {
        signal: new AbortController().signal,
      },
    ] as const;

    await client.query(..._arguments);
    await client.mutation(..._arguments);
    client.subscription(..._arguments);
  });
});

test('subscription required parameters and result', () => {
  const client = createTRPCUntypedClient({
    links: [],
  });

  ignoreErrors(() => {
    // @ts-expect-error must pass input
    client.subscription('foo');

    // options are optional, e.g. when only iterating
    client.subscription('foo', { bar: 1 });

    const subResult = client.subscription('foo', { bar: 1 }, {});

    expectTypeOf<typeof subResult>().toEqualTypeOf<TRPCSubscription<unknown>>();
    expectTypeOf<typeof subResult>().toMatchTypeOf<Unsubscribable>();
  });
});

test('query and mutation result type is Promise<any>', () => {
  const client = createTRPCUntypedClient({
    links: [],
  });

  ignoreErrors(async () => {
    const queryResult = client.query('foo');
    expectTypeOf<typeof queryResult>().toEqualTypeOf<Promise<unknown>>();
    const awaitedQueryResult = await queryResult;
    expectTypeOf<typeof awaitedQueryResult>().toBeUnknown();

    const mutationResult = client.query('foo');
    expectTypeOf<typeof mutationResult>().toEqualTypeOf<Promise<unknown>>();
    const awaitedMutationResult = await mutationResult;
    expectTypeOf<typeof awaitedMutationResult>().toBeUnknown();
  });
});
