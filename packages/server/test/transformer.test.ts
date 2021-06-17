/* eslint-disable @typescript-eslint/no-unused-vars */
import devalue from 'devalue';
import superjson from 'superjson';
import { z } from 'zod';
import {
  createWSClient,
  TRPCWebSocketClient,
  wsLink,
} from '../../client/src/links/wsLink';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

test('superjson up and down', async () => {
  const transformer = superjson;

  const date = new Date();
  const fn = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      input: z.date(),
      resolve({ input }) {
        fn(input);
        return input;
      },
    }),
    {
      client: { transformer },
      server: { transformer },
    },
  );
  const res = await client.query('hello', date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0][0] as Date).getTime()).toBe(date.getTime());

  close();
});

test('empty superjson up and down', async () => {
  const transformer = superjson;

  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .query('empty-up', {
        resolve() {
          return 'hello world';
        },
      })
      .query('empty-down', {
        input: z.string(),
        resolve() {
          return 'hello world';
        },
      }),
    {
      client: { transformer },
      server: { transformer },
    },
  );
  const res1 = await client.query('empty-up');
  expect(res1).toBe('hello world');
  const res2 = await client.query('empty-down', '');
  expect(res2).toBe('hello world');

  close();
});

test('wsLink: empty superjson up and down', async () => {
  const transformer = superjson;
  let ws: any = null;
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .query('empty-up', {
        resolve() {
          return 'hello world';
        },
      })
      .query('empty-down', {
        input: z.string(),
        resolve() {
          return 'hello world';
        },
      }),
    {
      client({ wssUrl }) {
        ws = createWSClient({ url: wssUrl });
        return { transformer, links: [wsLink({ client: ws })] };
      },
      server: { transformer },
      wssServer: { transformer },
    },
  );
  const res1 = await client.query('empty-up');
  expect(res1).toBe('hello world');
  const res2 = await client.query('empty-down', '');
  expect(res2).toBe('hello world');

  close();
  ws.close();
});

test('devalue up and down', async () => {
  const transformer: trpc.DataTransformer = {
    serialize: (object) => devalue(object),
    deserialize: (object) => eval(`(${object})`),
  };

  const date = new Date();
  const fn = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      input: z.date(),
      resolve({ input }) {
        fn(input);
        return input;
      },
    }),
    {
      client: { transformer },
      server: { transformer },
    },
  );
  const res = await client.query('hello', date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0][0] as Date).getTime()).toBe(date.getTime());

  close();
});

test('superjson up and devalue down', async () => {
  const transformer: trpc.CombinedDataTransformer = {
    input: superjson,
    output: {
      serialize: (object) => devalue(object),
      deserialize: (object) => eval(`(${object})`),
    },
  };

  const date = new Date();
  const fn = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      input: z.date(),
      resolve({ input }) {
        fn(input);
        return input;
      },
    }),
    {
      client: { transformer },
      server: { transformer },
    },
  );
  const res = await client.query('hello', date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0][0] as Date).getTime()).toBe(date.getTime());

  close();
});

test('all transformers running in correct order', async () => {
  const world = 'foo';
  const fn = jest.fn();

  const transformer: trpc.CombinedDataTransformer = {
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

  const { client, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      input: z.string(),
      resolve({ input }) {
        fn(input);
        return input;
      },
    }),
    {
      client: { transformer },
      server: { transformer },
    },
  );
  const res = await client.query('hello', world);
  expect(res).toBe(world);
  expect(fn.mock.calls[0][0]).toBe('client:serialized');
  expect(fn.mock.calls[1][0]).toBe('server:deserialized');
  expect(fn.mock.calls[2][0]).toBe(world);
  expect(fn.mock.calls[3][0]).toBe('server:serialized');
  expect(fn.mock.calls[4][0]).toBe('client:deserialized');

  close();
});

describe('transformer on router', () => {
  test('http', async () => {
    const transformer = superjson;

    const date = new Date();
    const fn = jest.fn();
    const { client, close } = routerToServerAndClient(
      trpc
        .router()
        .transformer(transformer)
        .query('hello', {
          input: z.date(),
          resolve({ input }) {
            fn(input);
            return input;
          },
        }),
      {
        client: { transformer },
      },
    );
    const res = await client.query('hello', date);
    expect(res.getTime()).toBe(date.getTime());
    expect((fn.mock.calls[0][0] as Date).getTime()).toBe(date.getTime());

    close();
  });

  test('ws', async () => {
    let wsClient: TRPCWebSocketClient = null as any;
    const date = new Date();
    const fn = jest.fn();
    const transformer = superjson;
    const { client, close } = routerToServerAndClient(
      trpc
        .router()
        .transformer(transformer)
        .query('hello', {
          input: z.date(),
          resolve({ input }) {
            fn(input);
            return input;
          },
        }),
      {
        client({ wssUrl }) {
          wsClient = createWSClient({
            url: wssUrl,
          });
          return {
            transformer,
            links: [wsLink({ client: wsClient })],
          };
        },
      },
    );

    const res = await client.query('hello', date);
    expect(res.getTime()).toBe(date.getTime());
    expect((fn.mock.calls[0][0] as Date).getTime()).toBe(date.getTime());

    wsClient.close();
    close();
  });

  test('duplicate transformers', () => {
    expect(() =>
      trpc.router().transformer(superjson).transformer(superjson),
    ).toThrowErrorMatchingInlineSnapshot(
      `"You seem to have double \`transformer()\`-calls in your router tree"`,
    );
  });
});
