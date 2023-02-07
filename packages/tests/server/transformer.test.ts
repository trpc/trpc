import { routerToServerAndClientNew, waitError } from './___testHelpers';
import {
  TRPCClientError,
  createTRPCProxyClient,
  createWSClient,
  httpBatchLink,
  httpLink,
  wsLink,
} from '@trpc/client';
import {
  CombinedDataTransformer,
  DataTransformer,
  TRPCError,
  initTRPC,
} from '@trpc/server';
import { observable } from '@trpc/server/src/observable';
import devalue from 'devalue';
import superjson from 'superjson';
import { z } from 'zod';

test('superjson up and down', async () => {
  const transformer = superjson;
  const date = new Date();
  const fn = jest.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        transformer,
        links: [httpBatchLink({ url: httpUrl })],
      };
    },
  });

  const res = await proxy.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

  close();
});

test('empty superjson up and down', async () => {
  const transformer = superjson;

  const t = initTRPC.create({ transformer });

  const router = t.router({
    emptyUp: t.procedure.query(() => 'hello world'),
    emptyDown: t.procedure.input(z.string()).query(() => 'hello world'),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        transformer,
        links: [httpBatchLink({ url: httpUrl })],
      };
    },
  });
  const res1 = await proxy.emptyUp.query();
  expect(res1).toBe('hello world');
  const res2 = await proxy.emptyDown.query('');
  expect(res2).toBe('hello world');

  close();
});

test('wsLink: empty superjson up and down', async () => {
  const transformer = superjson;
  let ws: any = null;

  const t = initTRPC.create({ transformer });

  const router = t.router({
    emptyUp: t.procedure.query(() => 'hello world'),
    emptyDown: t.procedure.input(z.string()).query(() => 'hello world'),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client({ wssUrl }) {
      ws = createWSClient({ url: wssUrl });
      return {
        transformer,
        links: [wsLink({ client: ws })],
      };
    },
  });
  const res1 = await proxy.emptyUp.query();
  expect(res1).toBe('hello world');
  const res2 = await proxy.emptyDown.query('');
  expect(res2).toBe('hello world');

  close();
  ws.close();
});

test('devalue up and down', async () => {
  const transformer: DataTransformer = {
    serialize: (object) => devalue(object),
    deserialize: (object) => eval(`(${object})`),
  };
  const date = new Date();
  const fn = jest.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        transformer,
        links: [httpBatchLink({ url: httpUrl })],
      };
    },
  });
  const res = await proxy.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

  close();
});

test('not batching: superjson up and devalue down', async () => {
  const transformer: CombinedDataTransformer = {
    input: superjson,
    output: {
      serialize: (object) => devalue(object),
      deserialize: (object) => eval(`(${object})`),
    },
  };
  const date = new Date();
  const fn = jest.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        transformer,
        links: [httpLink({ url: httpUrl })],
      };
    },
  });
  const res = await proxy.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

  close();
});

test('batching: superjson up and devalue down', async () => {
  const transformer: CombinedDataTransformer = {
    input: superjson,
    output: {
      serialize: (object) => devalue(object),
      deserialize: (object) => eval(`(${object})`),
    },
  };
  const date = new Date();
  const fn = jest.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        transformer,
        links: [httpBatchLink({ url: httpUrl })],
      };
    },
  });
  const res = await proxy.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

  close();
});

test('batching: superjson up and f down', async () => {
  const transformer: CombinedDataTransformer = {
    input: superjson,
    output: {
      serialize: (object) => devalue(object),
      deserialize: (object) => eval(`(${object})`),
    },
  };
  const date = new Date();
  const fn = jest.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client: ({ httpUrl }) => ({
      transformer,
      links: [httpBatchLink({ url: httpUrl })],
    }),
  });
  const res = await proxy.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

  close();
});

test('all transformers running in correct order', async () => {
  const world = 'foo';
  const fn = jest.fn();

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

  const { close, proxy } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        transformer,
        links: [httpBatchLink({ url: httpUrl })],
      };
    },
  });
  const res = await proxy.hello.query(world);
  expect(res).toBe(world);
  expect(fn.mock.calls[0]![0]!).toBe('client:serialized');
  expect(fn.mock.calls[1]![0]!).toBe('server:deserialized');
  expect(fn.mock.calls[2]![0]!).toBe(world);
  expect(fn.mock.calls[3][0]).toBe('server:serialized');
  expect(fn.mock.calls[4][0]).toBe('client:deserialized');

  close();
});

describe('transformer on router', () => {
  test('http', async () => {
    const transformer = superjson;
    const date = new Date();
    const fn = jest.fn();

    const t = initTRPC.create({ transformer });

    const router = t.router({
      hello: t.procedure.input(z.date()).query(({ input }) => {
        fn(input);
        return input;
      }),
    });

    const { close, proxy } = routerToServerAndClientNew(router, {
      client({ httpUrl }) {
        return {
          transformer,
          links: [httpBatchLink({ url: httpUrl })],
        };
      },
    });
    const res = await proxy.hello.query(date);
    expect(res.getTime()).toBe(date.getTime());
    expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

    close();
  });

  test('ws', async () => {
    let wsClient: any;
    const date = new Date();
    const fn = jest.fn();
    const transformer = superjson;

    const t = initTRPC.create({ transformer });

    const router = t.router({
      hello: t.procedure.input(z.date()).query(({ input }) => {
        fn(input);
        return input;
      }),
    });

    const { close, proxy } = routerToServerAndClientNew(router, {
      client({ wssUrl }) {
        wsClient = createWSClient({
          url: wssUrl,
        });
        return {
          transformer,
          links: [wsLink({ client: wsClient })],
        };
      },
    });

    const res = await proxy.hello.query(date);
    expect(res.getTime()).toBe(date.getTime());
    expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

    wsClient.close();
    close();
  });

  test('subscription', async () => {
    let wsClient: any;
    const date = new Date();
    const fn = jest.fn();
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

    const { close, proxy } = routerToServerAndClientNew(router, {
      client({ wssUrl }) {
        wsClient = createWSClient({
          url: wssUrl,
        });
        return {
          transformer,
          links: [wsLink({ client: wsClient })],
        };
      },
    });

    const data = await new Promise<Date>((resolve) => {
      const subscription = proxy.hello.subscribe(date, {
        onData: (data) => {
          subscription.unsubscribe();
          resolve(data);
        },
      });
    });

    expect(data.getTime()).toBe(date.getTime());
    expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

    wsClient.close();
    close();
  });

  test('superjson up and devalue down: transform errors correctly', async () => {
    const transformer: CombinedDataTransformer = {
      input: superjson,
      output: {
        serialize: (object) => devalue(object),
        deserialize: (object) => eval(`(${object})`),
      },
    };

    class MyError extends Error {
      constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, MyError.prototype);
      }
    }
    const onError = jest.fn();

    const t = initTRPC.create({ transformer });

    const router = t.router({
      err: t.procedure.query(() => {
        throw new MyError('woop');
      }),
    });

    const { close, proxy } = routerToServerAndClientNew(router, {
      server: {
        onError,
      },
      client({ httpUrl }) {
        return {
          transformer,
          links: [httpBatchLink({ url: httpUrl })],
        };
      },
    });
    const clientError = await waitError(proxy.err.query(), TRPCClientError);
    expect(clientError.shape.message).toMatchInlineSnapshot(`"woop"`);
    expect(clientError.shape.code).toMatchInlineSnapshot(`-32603`);

    expect(onError).toHaveBeenCalledTimes(1);
    const serverError = onError.mock.calls[0]![0]!.error;

    expect(serverError).toBeInstanceOf(TRPCError);
    if (!(serverError instanceof TRPCError)) {
      throw new Error('Wrong error');
    }
    expect(serverError.cause).toBeInstanceOf(MyError);

    close();
  });
});

test('superjson - no input', async () => {
  const transformer = superjson;
  const fn = jest.fn();

  const t = initTRPC.create({ transformer });

  const router = t.router({
    hello: t.procedure.query(({ input }) => {
      fn(input);
      return 'world';
    }),
  });

  const { close, httpUrl } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        transformer,
        links: [httpBatchLink({ url: httpUrl })],
      };
    },
  });
  const json = await (await fetch(`${httpUrl}/hello`)).json();

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

  close();
});

describe('required transformers', () => {
  test('works without transformer', () => {
    const t = initTRPC.create({});
    const router = t.router({});

    createTRPCProxyClient<typeof router>({
      links: [httpBatchLink({ url: '' })],
    });
  });

  test('works with transformer', () => {
    const transformer = superjson;
    const t = initTRPC.create({
      transformer,
    });
    const router = t.router({});

    createTRPCProxyClient<typeof router>({
      links: [httpBatchLink({ url: '' })],
      transformer,
    });
  });

  test('errors with transformer set on backend but not on frontend', () => {
    const transformer = superjson;
    const t = initTRPC.create({
      transformer,
    });
    const router = t.router({});

    // @ts-expect-error missing transformer on frontend
    createTRPCProxyClient<typeof router>({
      links: [httpBatchLink({ url: '' })],
    });
  });

  test('errors with transformer set on frontend but not on backend', () => {
    const transformer = superjson;
    const t = initTRPC.create({});
    const router = t.router({});

    createTRPCProxyClient<typeof router>({
      links: [httpBatchLink({ url: '' })],
      // @ts-expect-error missing transformer on backend
      transformer,
    });
  });
});
