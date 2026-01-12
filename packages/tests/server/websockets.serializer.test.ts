import { EventEmitter, on } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { Serializer as ClientSerializer } from '@trpc/client';
import { initTRPC, tracked } from '@trpc/server';
import type { Serializer as ServerSerializer } from '@trpc/server/adapters/ws';
import { jsonSerializer } from '@trpc/server/adapters/ws';
import type { Observer } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import {
  createDeferred,
  run,
  sleep,
} from '@trpc/server/unstable-core-do-not-import';
import WebSocket from 'ws';
import { z } from 'zod';

type Message = {
  id: string;
  title?: string;
};

const mockBinarySerializer: ServerSerializer & ClientSerializer = {
  serialize: (data) => {
    const json = JSON.stringify(data);
    return new TextEncoder().encode(`BINARY:${json}`);
  },
  deserialize: (data) => {
    const str =
      typeof data === 'string'
        ? data
        : new TextDecoder().decode(
            data instanceof ArrayBuffer ? new Uint8Array(data) : data,
          );
    if (str.startsWith('BINARY:')) {
      return JSON.parse(str.slice(7));
    }
    return JSON.parse(str);
  },
};

function factory(config?: {
  serverSerializer?: ServerSerializer;
  clientSerializer?: ClientSerializer;
}) {
  const ee = new EventEmitter();
  const subRef: { current: Observer<Message, unknown> } = {} as any;
  const onNewMessageSubscription = vi.fn();
  const subscriptionEnded = vi.fn();

  const t = initTRPC.create();

  let iterableDeferred = createDeferred();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = createDeferred();
  };

  const appRouter = t.router({
    greeting: t.procedure.input(z.string().nullish()).query(({ input }) => {
      return `hello ${input ?? 'world'}`;
    }),
    echo: t.procedure
      .input(
        z.object({
          message: z.string(),
        }),
      )
      .mutation(({ input }) => {
        return { received: input.message };
      }),
    iterable: t.procedure
      .input(
        z
          .object({
            lastEventId: z.coerce.number().nullish(),
          })
          .nullish(),
      )
      .subscription(async function* (opts) {
        let from = opts?.input?.lastEventId ?? 0;

        while (true) {
          from++;
          await iterableDeferred.promise;
          const msg: Message = {
            id: String(from),
            title: 'hello ' + from,
          };

          yield tracked(String(from), msg);
        }
      }),
    onMessage: t.procedure.input(z.string().nullish()).subscription(() => {
      const sub = observable<Message>((emit) => {
        subRef.current = emit;
        const onMessage = (data: Message) => {
          emit.next(data);
        };
        ee.on('server:msg', onMessage);
        return () => {
          subscriptionEnded();
          ee.off('server:msg', onMessage);
        };
      });
      ee.emit('subscription:created');
      onNewMessageSubscription();
      return sub;
    }),
  });

  const onOpenMock = vi.fn();
  const onCloseMock = vi.fn();

  const opts = testServerAndClientResource(appRouter, {
    wsClient: {
      lazy: {
        enabled: false,
        closeMs: 0,
      },
      retryDelayMs: () => 50,
      onOpen: onOpenMock,
      onClose: onCloseMock,
      experimental_serializer: config?.clientSerializer,
    },
    client({ wsClient }) {
      return {
        links: [wsLink({ client: wsClient })],
      };
    },
    wssServer: {
      createContext: () => ({}),
      router: appRouter,
      experimental_serializer: config?.serverSerializer,
    },
  });

  return {
    ...opts,
    ee,
    subRef,
    onNewMessageSubscription,
    onOpenMock,
    onCloseMock,
    subscriptionEnded,
    nextIterable,
  };
}

describe('experimental_serializer', () => {
  describe('default JSON serializer', () => {
    test('query works without explicit serializer', async () => {
      await using ctx = factory();
      expect(await ctx.client.greeting.query()).toBe('hello world');
      expect(await ctx.client.greeting.query('test')).toBe('hello test');
    });

    test('mutation works without explicit serializer', async () => {
      await using ctx = factory();
      const result = await ctx.client.echo.mutate({ message: 'hello' });
      expect(result).toEqual({ received: 'hello' });
    });

    test('subscription works without explicit serializer', async () => {
      await using ctx = factory();
      ctx.ee.once('subscription:created', () => {
        setTimeout(() => {
          ctx.ee.emit('server:msg', { id: '1' });
          ctx.ee.emit('server:msg', { id: '2' });
        });
      });

      const onDataMock = vi.fn();
      const subscription = ctx.client.onMessage.subscribe(undefined, {
        onData: onDataMock,
      });

      await vi.waitFor(() => {
        expect(onDataMock).toHaveBeenCalledTimes(2);
      });

      expect(onDataMock.mock.calls).toMatchInlineSnapshot(`
        Array [
          Array [
            Object {
              "id": "1",
            },
          ],
          Array [
            Object {
              "id": "2",
            },
          ],
        ]
      `);

      subscription.unsubscribe();
    });
  });

  describe('explicit JSON serializer', () => {
    test('query works with explicit jsonSerializer', async () => {
      await using ctx = factory({
        serverSerializer: jsonSerializer,
        clientSerializer: jsonSerializer,
      });
      expect(await ctx.client.greeting.query()).toBe('hello world');
    });

    test('subscription works with explicit jsonSerializer', async () => {
      await using ctx = factory({
        serverSerializer: jsonSerializer,
        clientSerializer: jsonSerializer,
      });

      ctx.ee.once('subscription:created', () => {
        setTimeout(() => {
          ctx.ee.emit('server:msg', { id: '1' });
        });
      });

      const onDataMock = vi.fn();
      const subscription = ctx.client.onMessage.subscribe(undefined, {
        onData: onDataMock,
      });

      await vi.waitFor(() => {
        expect(onDataMock).toHaveBeenCalledTimes(1);
      });

      subscription.unsubscribe();
    });
  });

  describe('binary serializer', () => {
    test('query works with binary serializer', async () => {
      await using ctx = factory({
        serverSerializer: mockBinarySerializer,
        clientSerializer: mockBinarySerializer,
      });

      expect(await ctx.client.greeting.query()).toBe('hello world');
      expect(await ctx.client.greeting.query('binary')).toBe('hello binary');
    });

    test('mutation works with binary serializer', async () => {
      await using ctx = factory({
        serverSerializer: mockBinarySerializer,
        clientSerializer: mockBinarySerializer,
      });

      const result = await ctx.client.echo.mutate({ message: 'binary data' });
      expect(result).toEqual({ received: 'binary data' });
    });

    test('subscription works with binary serializer', async () => {
      await using ctx = factory({
        serverSerializer: mockBinarySerializer,
        clientSerializer: mockBinarySerializer,
      });

      ctx.ee.once('subscription:created', () => {
        setTimeout(() => {
          ctx.ee.emit('server:msg', { id: '1', title: 'first' });
          ctx.ee.emit('server:msg', { id: '2', title: 'second' });
        });
      });

      const onDataMock = vi.fn();
      const subscription = ctx.client.onMessage.subscribe(undefined, {
        onData: onDataMock,
      });

      await vi.waitFor(() => {
        expect(onDataMock).toHaveBeenCalledTimes(2);
      });

      expect(onDataMock.mock.calls.map((c) => c[0])).toEqual([
        { id: '1', title: 'first' },
        { id: '2', title: 'second' },
      ]);

      subscription.unsubscribe();
    });

    test('tracked subscription (iterable) works with binary serializer', async () => {
      await using ctx = factory({
        serverSerializer: mockBinarySerializer,
        clientSerializer: mockBinarySerializer,
      });

      const onData = vi.fn<(val: { id: string; data: Message }) => void>();
      const onStarted = vi.fn();

      const sub = ctx.client.iterable.subscribe(undefined, {
        onStarted,
        onData,
      });

      await vi.waitFor(() => {
        expect(onStarted).toHaveBeenCalledTimes(1);
      });

      ctx.nextIterable();

      await vi.waitFor(() => {
        expect(onData).toHaveBeenCalledTimes(1);
      });

      expect(onData.mock.calls[0]![0]).toEqual({
        id: '1',
        data: { id: '1', title: 'hello 1' },
      });

      sub.unsubscribe();
    });
  });

  describe('PING/PONG with binary serializer', () => {
    test('client responds to PING with PONG when using binary serializer', async () => {
      await using ctx = factory({
        serverSerializer: mockBinarySerializer,
        clientSerializer: mockBinarySerializer,
      });

      // Wait for connection to be established
      await vi.waitFor(() => {
        expect(ctx.wsClient.connection).not.toBe(null);
      });

      // Get the server-side WebSocket client
      const serverWsClients = Array.from(ctx.wss.clients);
      expect(serverWsClients.length).toBe(1);
      const serverWs = serverWsClients[0]!;

      // Set up PONG listener
      const onPong = vi.fn();
      serverWs.on('message', (raw) => {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        if (raw.toString() === 'PONG') {
          onPong();
        }
      });

      // Send PING from server
      serverWs.send('PING');

      // Wait for PONG response
      await vi.waitFor(() => {
        expect(onPong).toHaveBeenCalled();
      });
    });
  });

  describe('broadcastReconnectNotification', () => {
    test('broadcastReconnectNotification works with binary serializer', async () => {
      await using ctx = factory({
        serverSerializer: mockBinarySerializer,
        clientSerializer: mockBinarySerializer,
      });

      ctx.ee.once('subscription:created', () => {
        setTimeout(() => {
          ctx.ee.emit('server:msg', { id: '1' });
        });
      });

      const onStartedMock = vi.fn();
      const onDataMock = vi.fn();

      ctx.client.onMessage.subscribe(undefined, {
        onStarted: onStartedMock,
        onData: onDataMock,
      });

      await vi.waitFor(() => {
        expect(onStartedMock).toHaveBeenCalledTimes(1);
        expect(onDataMock).toHaveBeenCalledTimes(1);
      });

      ctx.wssHandler.broadcastReconnectNotification();

      await vi.waitFor(() => {
        expect(ctx.wss.clients.size).toBe(1);
        expect(ctx.onOpenMock).toHaveBeenCalledTimes(2);
        expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
      });

      ctx.ee.emit('server:msg', { id: '2' });

      await vi.waitFor(() => {
        expect(onDataMock).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('error handling', () => {
    test('parse errors are handled with binary serializer', async () => {
      await using ctx = factory({
        serverSerializer: mockBinarySerializer,
        clientSerializer: mockBinarySerializer,
      });

      const rawClient = new WebSocket(ctx.wssUrl);

      rawClient.onopen = () => {
        rawClient.send('invalid data that is not serialized correctly');
      };

      const res: any = await new Promise<string>((resolve) => {
        rawClient.addEventListener('message', (msg) => {
          const str =
            typeof msg.data === 'string'
              ? msg.data
              : new TextDecoder().decode(msg.data as ArrayBuffer);
          resolve(mockBinarySerializer.deserialize(str) as string);
        });
      });

      expect(res).toHaveProperty('error');
      expect(res.error.data.code).toBe('PARSE_ERROR');
      rawClient.close();
    });
  });

  describe('connection params', () => {
    test('connection params work with binary serializer', async () => {
      const USER_TOKEN = 'secret123';
      const t = initTRPC
        .context<{ user: { id: string } | null }>()
        .create();

      const router = t.router({
        whoami: t.procedure.query((opts) => opts.ctx.user),
      });

      await using ctx = testServerAndClientResource(router, {
        wssServer: {
          async createContext(opts) {
            const token = opts.info.connectionParams?.['token'];
            return {
              user: token === USER_TOKEN ? { id: '123' } : null,
            };
          },
          experimental_serializer: mockBinarySerializer,
        },
      });

      const wsClient = createWSClient({
        url: ctx.wssUrl,
        connectionParams: async () => ({ token: USER_TOKEN }),
        lazy: { enabled: true, closeMs: 0 },
        experimental_serializer: mockBinarySerializer,
      });

      const client = createTRPCClient<typeof router>({
        links: [wsLink({ client: wsClient })],
      });

      const result = await client.whoami.query();
      expect(result).toEqual({ id: '123' });

      wsClient.close();
    });
  });
});

describe('serializer interface', () => {
  test('jsonSerializer handles string input', () => {
    const data = { foo: 'bar', num: 42 };
    const serialized = jsonSerializer.serialize(data);
    expect(typeof serialized).toBe('string');
    expect(jsonSerializer.deserialize(serialized)).toEqual(data);
  });

  test('jsonSerializer handles ArrayBuffer input', () => {
    const data = { foo: 'bar', num: 42 };
    const json = JSON.stringify(data);
    const buffer = new TextEncoder().encode(json).buffer;
    expect(jsonSerializer.deserialize(buffer as ArrayBuffer)).toEqual(data);
  });

  test('jsonSerializer handles Uint8Array input', () => {
    const data = { foo: 'bar', num: 42 };
    const json = JSON.stringify(data);
    const uint8 = new TextEncoder().encode(json);
    expect(jsonSerializer.deserialize(uint8)).toEqual(data);
  });
});
