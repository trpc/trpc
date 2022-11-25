/* eslint-disable @typescript-eslint/no-unused-vars */
import { routerToServerAndClientNew } from './___testHelpers';
import { createWSClient, httpBatchLink, httpLink, wsLink } from '@trpc/client';
import {
  CombinedDataTransformer,
  DataTransformer,
  initTRPC,
} from '@trpc/server';
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

// test('all transformers running in correct order', async () => {
//   const world = 'foo';
//   const fn = jest.fn();

//   const transformer: trpc.CombinedDataTransformer = {
//     input: {
//       serialize: (object) => {
//         fn('client:serialized');
//         return object;
//       },
//       deserialize: (object) => {
//         fn('server:deserialized');
//         return object;
//       },
//     },
//     output: {
//       serialize: (object) => {
//         fn('server:serialized');
//         return object;
//       },
//       deserialize: (object) => {
//         fn('client:deserialized');
//         return object;
//       },
//     },
//   };

//   const { client, close } = legacyRouterToServerAndClient(
//     trpc
//       .router()
//       .transformer(transformer)
//       .query('hello', {
//         input: z.string(),
//         resolve({ input }) {
//           fn(input);
//           return input;
//         },
//       }),
//     {
//       client({ httpUrl }) {
//         return {
//           transformer,
//           links: [httpBatchLink({ url: httpUrl })],
//         };
//       },
//     },
//   );
//   const res = await client.query('hello', world);
//   expect(res).toBe(world);
//   expect(fn.mock.calls[0]![0]!).toBe('client:serialized');
//   expect(fn.mock.calls[1]![0]!).toBe('server:deserialized');
//   expect(fn.mock.calls[2]![0]!).toBe(world);
//   expect(fn.mock.calls[3][0]).toBe('server:serialized');
//   expect(fn.mock.calls[4][0]).toBe('client:deserialized');

//   close();
// });

// describe('transformer on router', () => {
//   test('http', async () => {
//     const transformer = superjson;

//     const date = new Date();
//     const fn = jest.fn();
//     const { client, close } = legacyRouterToServerAndClient(
//       trpc
//         .router()
//         .transformer(transformer)
//         .query('hello', {
//           input: z.date(),
//           resolve({ input }) {
//             fn(input);
//             return input;
//           },
//         }),
//       {
//         client({ httpUrl }) {
//           return {
//             transformer,
//             links: [httpBatchLink({ url: httpUrl })],
//           };
//         },
//       },
//     );
//     const res = await client.query('hello', date);
//     expect(res.getTime()).toBe(date.getTime());
//     expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

//     close();
//   });

//   test('ws', async () => {
//     let wsClient: any;
//     const date = new Date();
//     const fn = jest.fn();
//     const transformer = superjson;
//     const { client, close } = legacyRouterToServerAndClient(
//       trpc
//         .router()
//         .transformer(transformer)
//         .query('hello', {
//           input: z.date(),
//           resolve({ input }) {
//             fn(input);
//             return input;
//           },
//         }),
//       {
//         client({ wssUrl }) {
//           wsClient = createWSClient({
//             url: wssUrl,
//           });
//           return {
//             transformer,
//             links: [wsLink({ client: wsClient })],
//           };
//         },
//       },
//     );

//     const res = await client.query('hello', date);
//     expect(res.getTime()).toBe(date.getTime());
//     expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

//     wsClient.close();
//     close();
//   });

//   test('subscription', async () => {
//     let wsClient: any;
//     const date = new Date();
//     const fn = jest.fn();
//     const transformer = superjson;
//     const { client, close } = routerToServerAndClientNew(
//       trpc
//         .router()
//         .transformer(transformer)
//         .subscription('hello', {
//           input: z.date(),
//           resolve({ input }) {
//             return observable<Date>((emit) => {
//               fn(input);
//               emit.next(input);
//               return () => {
//                 // noop
//               };
//             });
//           },
//         })
//         .interop(),
//       {
//         client({ wssUrl }) {
//           wsClient = createWSClient({
//             url: wssUrl,
//           });
//           return {
//             transformer,
//             links: [wsLink({ client: wsClient })],
//           };
//         },
//       },
//     );

//     const data = await new Promise<Date>((resolve) => {
//       const subscription = client.subscription('hello', date, {
//         onData: (data) => {
//           subscription.unsubscribe();
//           resolve(data);
//         },
//       });
//     });

//     expect(data.getTime()).toBe(date.getTime());
//     expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

//     wsClient.close();
//     close();
//   });

//   test('duplicate transformers', () => {
//     expect(() =>
//       trpc.router().transformer(superjson).transformer(superjson),
//     ).toThrowErrorMatchingInlineSnapshot(
//       `"You seem to have double \`transformer()\`-calls in your router tree"`,
//     );
//   });

//   test('superjson up and devalue down: transform errors correctly', async () => {
//     const transformer: trpc.CombinedDataTransformer = {
//       input: superjson,
//       output: {
//         serialize: (object) => devalue(object),
//         deserialize: (object) => eval(`(${object})`),
//       },
//     };

//     class MyError extends Error {
//       constructor(message: string) {
//         super(message);
//         Object.setPrototypeOf(this, MyError.prototype);
//       }
//     }
//     const onError = jest.fn();
//     const { client, close } = legacyRouterToServerAndClient(
//       trpc
//         .router()
//         .transformer(transformer)
//         .query('err', {
//           resolve() {
//             throw new MyError('woop');
//           },
//         }),
//       {
//         server: {
//           onError,
//         },
//         client({ httpUrl }) {
//           return {
//             transformer,
//             links: [httpBatchLink({ url: httpUrl })],
//           };
//         },
//       },
//     );
//     const clientError = await waitError(client.query('err'), TRPCClientError);
//     expect(clientError.shape.message).toMatchInlineSnapshot(`"woop"`);
//     expect(clientError.shape.code).toMatchInlineSnapshot(`-32603`);

//     expect(onError).toHaveBeenCalledTimes(1);
//     const serverError = onError.mock.calls[0]![0]!.error;

//     expect(serverError).toBeInstanceOf(TRPCError);
//     if (!(serverError instanceof TRPCError)) {
//       throw new Error('Wrong error');
//     }
//     expect(serverError.cause).toBeInstanceOf(MyError);

//     close();
//   });
// });

// test('superjson - no input', async () => {
//   const transformer = superjson;

//   const fn = jest.fn();
//   const { close, httpUrl } = legacyRouterToServerAndClient(
//     trpc
//       .router()
//       .transformer(transformer)
//       .query('hello', {
//         async resolve({ input }) {
//           fn(input);
//           return 'world';
//         },
//       }),
//     {
//       client({ httpUrl }) {
//         return {
//           transformer,
//           links: [httpBatchLink({ url: httpUrl })],
//         };
//       },
//     },
//   );
//   const json = await (await fetch(`${httpUrl}/hello`)).json();

//   expect(json).not.toHaveProperty('error');
//   expect(json).toMatchInlineSnapshot(`
// Object {
//   "result": Object {
//     "data": Object {
//       "json": "world",
//     },
//   },
// }
// `);

//   close();
// });
