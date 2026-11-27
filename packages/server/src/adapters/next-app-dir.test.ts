import {
  notFound,
  RedirectType,
  redirect as nextRedirect,
} from 'next/navigation';
import { z } from 'zod';
import { experimental_trpcMiddleware, initTRPC } from '../@trpc/server';
import { nextAppDirCaller } from './next-app-dir/nextAppDirCaller';
import { redirect, TRPCRedirectError } from './next-app-dir/redirect';

test('experimental caller', async () => {
  const t = initTRPC.create();

  const base = t.procedure
    .use((opts) => {
      return opts.next({
        ctx: {
          foo: 'bar' as const,
        },
      });
    })
    .experimental_caller(
      nextAppDirCaller({
        normalizeFormData: true,
      }),
    );

  {
    // no input
    const proc = base.query(async () => 'hello');
    const result = await proc();
    expect(result).toBe('hello');

    expect((proc as any)._def.type).toBe('query');
  }
});

test('with context', async () => {
  const t = initTRPC
    .context<{
      foo: string;
    }>()
    .create();

  t.procedure.experimental_caller(
    nextAppDirCaller({
      createContext: () => ({ foo: 'bar' }),
    }),
  );

  t.procedure.experimental_caller(
    nextAppDirCaller(
      // @ts-expect-error no error
      {},
    ),
  );
});

test('with path extractor', async () => {
  interface Meta {
    span: string;
  }
  const t = initTRPC.meta<Meta>().create();

  // Some external middleware that relies on procedure paths
  const loggerMiddleware = experimental_trpcMiddleware().create(
    async (opts) => {
      const start = new Date().getTime();
      const result = await opts.next();
      const duration = new Date().getTime() - start;

      // oxlint-disable-next-line no-console
      console.log(`${opts.path} took ${duration}ms`);

      return result;
    },
  );

  const base = t.procedure
    .experimental_caller(
      nextAppDirCaller({
        pathExtractor: ({ meta }) => (meta as Meta).span,
      }),
    )
    .use(loggerMiddleware);

  const loggerSpy = vi.spyOn(console, 'log').mockImplementation(() => {
    // no-op
  });

  {
    const proc = base.meta({ span: 'hello' }).query(async () => 'hello');
    const result = await proc();
    expect(result).toBe('hello');

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('hello took'),
    );
  }
});

test('onError receives the submitted form data when useActionState passes the previous state first', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();

  const proc = t.procedure
    .experimental_caller(nextAppDirCaller({ onError }))
    .mutation(() => {
      throw new Error('boom');
    });

  const formData = new FormData();
  formData.set('name', 'Ada');

  await expect((proc as any)({ name: 'stale' }, formData)).rejects.toThrow(
    'boom',
  );

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]![0].input).toEqual({ name: 'Ada' });
  expect(onError.mock.calls[0]![0]).toMatchObject({
    path: '',
    type: 'mutation',
    error: { message: 'boom' },
  });
});

test('onError receives the normalized form data for a single argument call', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();

  const proc = t.procedure
    .experimental_caller(nextAppDirCaller({ onError }))
    .mutation(() => {
      throw new Error('boom');
    });

  const formData = new FormData();
  formData.set('name', 'Ada');

  await expect((proc as any)(formData)).rejects.toThrow('boom');

  expect(onError).toHaveBeenCalledTimes(1);
  // `formDataToObject` returns a null-prototype object, so this compares values only
  expect(onError.mock.calls[0]![0].input).toEqual({ name: 'Ada' });
});

test('redirect accepts the redirect types of the installed Next.js', () => {
  // Next 15 types these as an enum, Next 16 as 'push' | 'replace'; tRPC takes
  // whichever the installed `next/navigation` uses. The tests run on Next 16,
  // so the bare string is accepted (Next 15's own `redirect()` rejects it)
  const viaConst = redirect('/a', RedirectType.replace) as unknown;
  assert(viaConst instanceof TRPCRedirectError);
  expect(viaConst.args).toEqual(['/a', 'replace']);

  const viaString = redirect('/b', 'push') as unknown;
  assert(viaString instanceof TRPCRedirectError);
  expect(viaString.args).toEqual(['/b', 'push']);

  // @ts-expect-error not a Next.js redirect type
  redirect('/c', 'bogus');
});

test('onError is called and a TRPCError is thrown when form data cannot be normalized', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();

  const proc = t.procedure
    .experimental_caller(nextAppDirCaller({ onError }))
    .mutation(() => 'ok');

  // `user` as a scalar and `user.name` as a nested key collide, so
  // `formDataToObject` throws while building the object.
  const formData = new FormData();
  formData.set('user', 'alice');
  formData.set('user.name', 'bob');

  await expect((proc as any)(formData)).rejects.toMatchObject({
    name: 'TRPCError',
    code: 'INTERNAL_SERVER_ERROR',
  });

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]![0]).toMatchObject({
    path: '',
    type: 'mutation',
    error: { code: 'INTERNAL_SERVER_ERROR' },
  });
});

test('onError is called and a TRPCError is thrown when createContext throws', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();
  const cause = new Error('session lookup failed');

  const proc = t.procedure
    .experimental_caller(
      nextAppDirCaller({
        onError,
        createContext: () => {
          throw cause;
        },
      }),
    )
    .mutation(() => 'ok');

  await expect((proc as any)({})).rejects.toMatchObject({
    name: 'TRPCError',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to create context',
    cause,
  });

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]![0]).toMatchObject({
    path: '',
    type: 'mutation',
    ctx: undefined,
    input: undefined,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create context',
    },
  });
});

test('redirect() in createContext reaches Next.js', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();
  // the error `redirect()` throws; Next.js redirects on its digest
  let nextError: unknown;

  const proc = t.procedure
    .experimental_caller(
      nextAppDirCaller({
        onError,
        createContext: () => {
          try {
            nextRedirect('/login');
          } catch (cause) {
            nextError = cause;
            throw cause;
          }
        },
      }),
    )
    .mutation(() => 'ok');

  await expect((proc as any)({})).rejects.toBe(nextError);

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]![0].error.cause).toBe(nextError);
});

test('notFound() in createContext reaches Next.js', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();
  // the error `notFound()` throws; Next.js renders the not-found page on it
  let nextError: unknown;

  const proc = t.procedure
    .experimental_caller(
      nextAppDirCaller({
        onError,
        createContext: () => {
          try {
            notFound();
          } catch (cause) {
            nextError = cause;
            throw cause;
          }
        },
      }),
    )
    .query(() => 'ok');

  await expect((proc as any)()).rejects.toBe(nextError);

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]![0].error.cause).toBe(nextError);
});

test('form data cannot add properties to String.prototype', async () => {
  const t = initTRPC.create();
  const proc = t.procedure
    .experimental_caller(nextAppDirCaller({}))
    .mutation(() => 'ok');

  // `a` holds a string, and `'x'.__proto__` is `String.prototype`
  const formData = new FormData();
  formData.append('a', 'x');
  formData.append('a[__proto__][nextAppDirPolluted]', 'yes');

  await expect((proc as any)(formData)).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });
  const polluted = ('' as any).nextAppDirPolluted;
  delete (String.prototype as any).nextAppDirPolluted;
  expect(polluted).toBeUndefined();
});

describe('input only has what the validator returned', () => {
  function setup() {
    const t = initTRPC.create();
    const received = vi.fn<(input: unknown) => void>();
    const base = t.procedure.experimental_caller(nextAppDirCaller({}));
    const schema = z.object({ displayName: z.string() });
    return {
      received,
      mutation: base.input(schema).mutation((opts) => {
        received(opts.input);
      }),
      query: base.input(schema).query((opts) => {
        received(opts.input);
      }),
      chained: base
        .input(z.object({ orgId: z.string() }))
        .input(schema)
        .mutation((opts) => {
          received(opts.input);
        }),
    };
  }

  test('mutation called with an object', async () => {
    const { mutation, received } = setup();

    await (mutation as any)({ displayName: 'alice', role: 'admin' });

    expect(received).toHaveBeenCalledWith({ displayName: 'alice' });
  });

  test('mutation called with form data', async () => {
    const { mutation, received } = setup();
    const formData = new FormData();
    formData.set('displayName', 'alice');
    formData.set('role', 'admin');

    await (mutation as any)(formData);

    expect(received).toHaveBeenCalledWith({ displayName: 'alice' });
  });

  test('mutation called by useActionState with the previous state first', async () => {
    const { mutation, received } = setup();

    await (mutation as any)(null, { displayName: 'alice', role: 'admin' });

    expect(received).toHaveBeenCalledWith({ displayName: 'alice' });
  });

  test('query', async () => {
    const { query, received } = setup();

    await (query as any)({ displayName: 'alice', role: 'admin' });

    expect(received).toHaveBeenCalledWith({ displayName: 'alice' });
  });

  test('chained inputs are still merged', async () => {
    const { chained, received } = setup();

    await (chained as any)({
      orgId: 'o1',
      displayName: 'alice',
      role: 'admin',
    });

    expect(received).toHaveBeenCalledWith({
      orgId: 'o1',
      displayName: 'alice',
    });
  });
});

test('a large array index in form data is rejected without building a sparse array', async () => {
  const t = initTRPC.create();
  const proc = t.procedure
    .experimental_caller(nextAppDirCaller({}))
    .input(z.object({ items: z.array(z.string()) }))
    .mutation((opts) => opts.input.items.length);

  // a sparse array would have 1,000,001 holes for the validator to walk
  const formData = new FormData();
  formData.append('items[1000000]', 'x');

  const error = await (proc as any)(formData).catch((cause: unknown) => cause);

  expect(error).toMatchObject({ code: 'BAD_REQUEST' });
  expect(error.cause.issues).toHaveLength(1);
});
