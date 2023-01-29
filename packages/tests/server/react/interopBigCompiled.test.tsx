/* eslint-disable no-console */
import { appRouter as bigV10Router } from '../__generated__/bigBoi/_app';
import { t } from '../__generated__/bigBoi/_trpc';
import { bigRouter as bigV9Router } from '../__generated__/bigLegacyRouter/bigRouter';
import {
  createTRPCClient,
  createTRPCProxyClient,
  httpBatchLink,
} from '@trpc/client/src/index';
import { createReactQueryHooks } from '@trpc/react-query/src/index';
import { expectTypeOf } from 'expect-type';

const legacyRouterInterop = bigV9Router.interop();

const appRouter = t.mergeRouters(legacyRouterInterop, bigV10Router);

type AppRouter = typeof appRouter;

test('raw client', async () => {
  try {
    const client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: 'http://localhost:-1' })],
    });

    const result = await client.query('oldProc100');
    //     ^?

    expectTypeOf(result).toEqualTypeOf<'100'>();
  } catch {
    // ignore
  }

  try {
    const proxy = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost:-1',
        }),
      ],
    });
    const result = await proxy.r0.greeting.query({ who: 'KATT' });

    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toMatchTypeOf<string>();
  } catch {
    // ignore
  }
});

test('react', () => {
  const prevConsoleError = console.error;
  console.error = () => {
    // whatever
  };
  const trpc = createReactQueryHooks<AppRouter>();

  try {
    const { data } = trpc.useQuery(['oldProc100']);
    if (!data) {
      throw new Error('Whaever');
    }
    expectTypeOf(data).toEqualTypeOf<'100'>();
  } catch {
    // whatev
  }

  try {
    const { data } = trpc.proxy.r499.greeting.useQuery({ who: 'KATT' });
    if (!data) {
      throw new Error('Whaever');
    }
    expectTypeOf(data).not.toBeAny();
    expectTypeOf(data).toMatchTypeOf<string>();
  } catch {
    // whatev
  }
  console.error = prevConsoleError;
});
