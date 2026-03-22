import assert from 'node:assert';
import type { AnyRouter } from '@trpc/server';
import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import { createTRPCClient } from './createTRPCClient';
import type { LocalLinkOptions } from './links/localLink';
import { unstable_localLink as localLink } from './links/localLink';
import { safe } from './safe';
import type { TRPCClientError } from './TRPCClientError';

function localLinkClient<TRouter extends AnyRouter>(
  opts: LocalLinkOptions<TRouter>,
) {
  const onError = vi.fn<NonNullable<LocalLinkOptions<TRouter>['onError']>>();
  const client = createTRPCClient<TRouter>({
    links: [
      localLink({
        onError,
        ...opts,
      }),
    ],
  });

  return {
    client,
    onError,
  };
}

test('safe returns typed result for success', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    hello: t.procedure.query(() => 'hello' as const),
  });

  const { client } = localLinkClient<typeof appRouter>({
    router: appRouter,
    createContext: async () => ({}),
  });

  const [result, error] = await safe(client.hello.query());

  expectTypeOf(result).toEqualTypeOf<'hello' | undefined>();
  expectTypeOf(error).toEqualTypeOf<
    TRPCClientError<typeof appRouter> | undefined
  >();
  expect(result).toBe('hello');
  expect(error).toBeUndefined();
});

describe('safe error handling', () => {
  const BadPhoneError = createTRPCDeclaredError({
    code: 'UNAUTHORIZED',
    key: 'BAD_PHONE',
  })
    .data<{
      reason: 'BAD_PHONE';
    }>()
    .create({
      constants: {
        reason: 'BAD_PHONE' as const,
      },
    });
  const BadPhone2Error = createTRPCDeclaredError({
    code: 'UNAUTHORIZED',
    key: 'BAD_PHONE',
  })
    .data<{
      message: 'BAD_PHONE';
    }>()
    .create({
      constants: {
        message: 'BAD_PHONE' as const,
      },
    });

  function setup() {
    const t = initTRPC.create({
      errorFormatter(opts) {
        return {
          ...opts.shape,
          data: {
            ...opts.shape.data,
            foo: 'bar' as const,
          },
        };
      },
    });

    const appRouter = t.router({
      registered: t.procedure.errors([BadPhoneError]).query(() => {
        throw new BadPhoneError();
      }),
      unregistered: t.procedure.errors([BadPhone2Error]).query(() => {
        throw new BadPhoneError();
      }),
    });

    const { client } = localLinkClient<typeof appRouter>({
      router: appRouter,
      createContext: async () => ({}),
    });

    return {
      appRouter,
      client,
    };
  }

  test('returns typed declared errors for registered declared errors', async () => {
    const { client } = setup();
    const [result, error] = await safe(client.registered.query());

    expect(result).toBeUndefined();
    assert(error);
    assert(error.isDeclaredError('BAD_PHONE'));
    expect(error.shape?.['~']).toEqual({
      kind: 'declared',
      declaredErrorKey: 'BAD_PHONE',
    });
    expectTypeOf(error.data.reason).toEqualTypeOf<'BAD_PHONE'>();
  });

  test('returns formatted errors for unregistered declared errors', async () => {
    const { client } = setup();
    const [result, error] = await safe(client.unregistered.query());

    expect(result).toBeUndefined();
    assert(error);
    assert(error.isFormattedError());
    expect(error.shape?.['~']).toEqual({
      kind: 'formatted',
    });
    expectTypeOf(error.data.foo).toEqualTypeOf<'bar'>();
  });
});
