import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  httpLink,
  TRPCClientError,
  wsLink,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type {
  CombinedDataTransformer,
  DataTransformer,
} from '@trpc/server/unstable-core-do-not-import';
import { uneval } from 'devalue';
import superjson from 'superjson';
import { createTson, tsonDate } from 'tupleson';
import { z } from 'zod';

test('superjson up and down', async () => {
  const transformer = superjson;
  const date = new Date();
  const fn = vi.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    client({ httpUrl, transformer }) {
      return {
        links: [httpBatchLink({ url: httpUrl, transformer })],
      };
    },
  });

  const res = await ctx.client.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());
});

test('empty superjson up and down', async () => {
  const transformer = superjson;

  const t = initTRPC.create({ transformer });

  const router = t.router({
    emptyUp: t.procedure.query(() => 'hello world'),
    emptyDown: t.procedure.input(z.string()).query(() => 'hello world'),
  });

  await using ctx = testServerAndClientResource(router, {
    client({ httpUrl }) {
      return {
        links: [httpBatchLink({ url: httpUrl, transformer })],
      };
    },
  });
  const res1 = await ctx.client.emptyUp.query();
  expect(res1).toBe('hello world');
  const res2 = await ctx.client.emptyDown.query('');
  expect(res2).toBe('hello world');
});

test('wsLink: empty superjson up and down', async () => {
  const transformer = superjson;
  let ws: any = null;

  const t = initTRPC.create({ transformer });

  const router = t.router({
    emptyUp: t.procedure.query(() => 'hello world'),
    emptyDown: t.procedure.input(z.string()).query(() => 'hello world'),
  });

  await using ctx = testServerAndClientResource(router, {
    client({ wssUrl }) {
      ws = createWSClient({ url: wssUrl });
      return {
        links: [wsLink({ client: ws, transformer })],
      };
    },
  });
  const res1 = await ctx.client.emptyUp.query();
  expect(res1).toBe('hello world');
  const res2 = await ctx.client.emptyDown.query('');
  expect(res2).toBe('hello world');
});

test('devalue up and down', async () => {
  const transformer: DataTransformer = {
    serialize: (object) => uneval(object),
    deserialize: (object) => eval(`(${object})`),
  };
  const date = new Date();
  const fn = vi.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    client({ httpUrl }) {
      return {
        links: [httpBatchLink({ url: httpUrl, transformer })],
      };
    },
  });
  const res = await ctx.client.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());
});

test('not batching: superjson up and devalue down', async () => {
  const transformer: CombinedDataTransformer = {
    input: superjson,
    output: {
      serialize: (object) => uneval(object),
      deserialize: (object) => eval(`(${object})`),
    },
  };
  const date = new Date();
  const fn = vi.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    client({ httpUrl }) {
      return {
        links: [httpLink({ url: httpUrl, transformer })],
      };
    },
  });
  const res = await ctx.client.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());
});

test('batching: superjson up and devalue down', async () => {
  const transformer: CombinedDataTransformer = {
    input: superjson,
    output: {
      serialize: (object) => uneval(object),
      deserialize: (object) => eval(`(${object})`),
    },
  };
  const date = new Date();
  const fn = vi.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    client({ httpUrl }) {
      return {
        links: [httpBatchLink({ url: httpUrl, transformer })],
      };
    },
  });
  const res = await ctx.client.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());
});

test('batching: superjson up and f down', async () => {
  const transformer: CombinedDataTransformer = {
    input: superjson,
    output: {
      serialize: (object) => uneval(object),
      deserialize: (object) => eval(`(${object})`),
    },
  };
  const date = new Date();
  const fn = vi.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    client: ({ httpUrl }) => ({
      links: [httpBatchLink({ url: httpUrl, transformer })],
    }),
  });
  const res = await ctx.client.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());
});

test('all transformers running in correct order', async () => {
  const world = 'foo';
  const fn = vi.fn();

  const transformer: CombinedDataTransformer = {
    input: {
      serialize: (object) => {
        fn('client:serialized');
        return object;
      },
      deserialize: (object) => {
        fn('server:deserialized');
        return object;
      },
    },
    output: {
      serialize: (object) => {
        fn('server:serialized');
        return object;
      },
      deserialize: (object) => {
        fn('client:deserialized');
        return object;
      },
    },
  };

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.string()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    client({ httpUrl }) {
      return {
        links: [httpBatchLink({ url: httpUrl, transformer })],
      };
    },
  });
  const res = await ctx.client.hello.query(world);
  expect(res).toBe(world);
  expect(fn.mock.calls[0]![0]).toBe('client:serialized');
  expect(fn.mock.calls[1]![0]).toBe('server:deserialized');
  expect(fn.mock.calls[2]![0]).toBe(world);
  expect(fn.mock.calls[3]![0]).toBe('server:serialized');
  expect(fn.mock.calls[4]![0]).toBe('client:deserialized');
});

describe('transformer on router', () => {
  test('http', async () => {
    const transformer = superjson;
    const date = new Date();
    const fn = vi.fn();

    const t = initTRPC.create({ transformer });

    const router = t.router({
      hello: t.procedure.input(z.date()).query(({ input }) => {
        fn(input);
        return input;
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpBatchLink({ url: httpUrl, transformer })],
        };
      },
    });
    const res = await ctx.client.hello.query(date);
    expect(res.getTime()).toBe(date.getTime());
    expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());
  });

  test('ws', async () => {
    let wsClient: any;
    const date = new Date();
    const fn = vi.fn();
    const transformer = superjson;

    const t = initTRPC.create({ transformer });

    const router = t.router({
      hello: t.procedure.input(z.date()).query(({ input }) => {
        fn(input);
        return input;
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ wssUrl }) {
        wsClient = createWSClient({
          url: wssUrl,
        });
        return {
          links: [wsLink({ client: wsClient, transformer })],
        };
      },
    });

    const res = await ctx.client.hello.query(date);
    expect(res.getTime()).toBe(date.getTime());
    expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

    wsClient.close();
  });

  test('subscription', async () => {
    let wsClient: any;
    const date = new Date();
    const fn = vi.fn();
    const transformer = superjson;

    const t = initTRPC.create({ transformer });

    const router = t.router({
      hello: t.procedure.input(z.date()).subscription(({ input }) => {
        return observable<Date>((emit) => {
          fn(input);
          emit.next(input);
          return () => {
            // noop
          };
        });
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ wssUrl }) {
        wsClient = createWSClient({
          url: wssUrl,
        });
        return {
          links: [wsLink({ client: wsClient, transformer })],
        };
      },
    });

    const data = await new Promise<Date>((resolve) => {
      const subscription = ctx.client.hello.subscribe(date, {
        onData: (data) => {
          subscription.unsubscribe();
          resolve(data);
        },
      });
    });

    expect(data.getTime()).toBe(date.getTime());
    expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

    wsClient.close();
  });

  test('superjson up and devalue down: transform errors correctly', async () => {
    const transformer: CombinedDataTransformer = {
      input: superjson,
      output: {
        serialize: (object) => uneval(object),
        deserialize: (object) => eval(`(${object})`),
      },
    };

    class MyError extends Error {
      constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, MyError.prototype);
      }
    }
    const onError = vi.fn();

    const t = initTRPC.create({ transformer });

    const router = t.router({
      err: t.procedure.query(() => {
        throw new MyError('woop');
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      server: {
        onError,
      },
      client({ httpUrl }) {
        return {
          links: [httpBatchLink({ url: httpUrl, transformer })],
        };
      },
    });
    const clientError = await waitError(
      ctx.client.err.query(),
      TRPCClientError,
    );
    expect(clientError.shape.message).toMatchInlineSnapshot(`"woop"`);
    expect(clientError.shape.code).toMatchInlineSnapshot(`-32603`);

    expect(onError).toHaveBeenCalledTimes(1);
    const serverError = onError.mock.calls[0]![0]!.error;

    expect(serverError).toBeInstanceOf(TRPCError);
    if (!(serverError instanceof TRPCError)) {
      throw new Error('Wrong error');
    }
    expect(serverError.cause).toBeInstanceOf(MyError);
  });
});

test('superjson - no input', async () => {
  const transformer = superjson;
  const fn = vi.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.query(({ input }) => {
      fn(input);
      return 'world';
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    client({ httpUrl }) {
      return {
        links: [httpBatchLink({ url: httpUrl, transformer })],
      };
    },
  });
  const json = await (await fetch(`${ctx.httpUrl}/hello`)).json();

  expect(json).not.toHaveProperty('error');
  expect(json).toMatchInlineSnapshot(`
Object {
  "result": Object {
    "data": Object {
      "json": "world",
    },
  },
}
`);
});

describe('required transformers', () => {
  test('works without transformer', () => {
    const t = initTRPC.create({});
    const router = t.router({});

    createTRPCClient<typeof router>({
      links: [httpBatchLink({ url: '' })],
    });
  });

  test('works with transformer', () => {
    const transformer = superjson;
    const t = initTRPC.create({
      transformer,
    });
    const router = t.router({});

    createTRPCClient<typeof router>({
      links: [httpBatchLink({ url: '', transformer })],
    });
  });

  test('errors with transformer set on backend but not on frontend', () => {
    const transformer = superjson;
    const t = initTRPC.create({
      transformer,
    });
    const router = t.router({});
    type Test = typeof t._config.$types.transformer;

    createTRPCClient<typeof router>({
      links: [
        httpBatchLink(
          // @ts-expect-error missing transformer on frontend
          { url: '' },
        ),
      ],
    });
  });

  test('errors with transformer set on frontend but not on backend', () => {
    const t = initTRPC.create({});
    const router = t.router({});
    type Test = typeof t._config.$types.transformer;

    const transformer = superjson;
    createTRPCClient<typeof router>({
      links: [httpBatchLink({ url: '' })],
      // @ts-expect-error missing transformer on backend
      transformer,
    });
  });
});

test('tupleson', async () => {
  const transformer = createTson({
    types: [tsonDate],
    nonce: () => Math.random() + '',
  });
  const date = new Date();
  const fn = vi.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    client({ httpUrl }) {
      return {
        links: [httpBatchLink({ url: httpUrl, transformer })],
      };
    },
  });

  const res = await ctx.client.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());
});
