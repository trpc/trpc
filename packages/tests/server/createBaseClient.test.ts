import { ignoreErrors } from './___testHelpers';
import { createBaseTRPCClient } from '@trpc/client/src';
import { Unsubscribable } from '@trpc/server/src/observable';
import { expectTypeOf } from 'expect-type';

test('loosely typed parameters', () => {
  const client = createBaseTRPCClient({
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
  const client = createBaseTRPCClient({
    links: [],
  });

  ignoreErrors(() => {
    // @ts-expect-error must pass input
    client.subscription('foo');

    // @ts-expect-error must pass options
    client.subscription('foo', { bar: 1 });

    const subResult = client.subscription('foo', { bar: 1 }, {});

    expectTypeOf<typeof subResult>().toEqualTypeOf<Unsubscribable>();
  });
});

test('query and mutation result type is Promise<any>', () => {
  const client = createBaseTRPCClient({
    links: [],
  });

  ignoreErrors(async () => {
    const queryResult = client.query('foo');
    expectTypeOf<typeof queryResult>().toEqualTypeOf<Promise<any>>();
    const awaitedQueryResult = await queryResult;
    expectTypeOf<typeof awaitedQueryResult>().toBeAny();

    const mutationResult = client.query('foo');
    expectTypeOf<typeof mutationResult>().toEqualTypeOf<Promise<any>>();
    const awaitedMutationResult = await mutationResult;
    expectTypeOf<typeof awaitedMutationResult>().toBeAny();
  });
});
