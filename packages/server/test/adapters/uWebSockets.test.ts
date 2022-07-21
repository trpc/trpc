/* eslint-disable @typescript-eslint/no-explicit-any */
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import * as uWs from 'uWebSockets.js';
import { z } from 'zod';
import { createTRPCClient } from '../../../client/src';
import * as trpc from '../../src';
import { TRPCError } from '../../src';
import * as trpcUws from '../../src/adapters/uWebSockets';

type Context = {
  user: {
    name: string;
  } | null;
};
async function startServer() {
  const createContext: any = (
    _opts: trpcUws.UWebSocketsContextOptions,
  ): Context => {
    const getUser = () => {
      if (_opts.req.headers.authorization === 'meow') {
        return {
          name: 'KATT',
        };
      }
      return null;
    };

    return {
      user: getUser(),
    };
    // return new Promise((resolve) => {
    //   setTimeout(() => {
    //     resolve({
    //       user: getUser(),
    //     });
    //   }, 200);
    // });
  };

  const router = trpc
    .router<Context>()
    .query('hello', {
      input: z
        .object({
          who: z.string().nullish(),
        })
        .nullish(),
      resolve({ input, ctx }) {
        return {
          text: `hello ${input?.who ?? ctx.user?.name ?? 'world'}`,
        };
      },
    })
    .query('error', {
      resolve() {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'error as expected',
        });
      },
    })
    .mutation('test', {
      input: z.object({
        value: z.string(),
      }),
      resolve({ input, ctx }) {
        return {
          originalValue: input.value,
          user: ctx.user,
        };
      },
    });

  const app = uWs.App();

  // Handle CORS
  app.options('/trpc/*', (res) => {
    res.writeHeader('Access-Control-Allow-Origin', '*');
    res.writeStatus('200 OK');
    res.end();
  });

  // need to register everything on the app object,
  // as uWebSockets does not have middleware
  trpcUws.registerTRPCasUWebSocketsEndpoint(app, '/trpc', {
    router,
    createContext,
  });

  const { socket, port } = await new Promise<{
    server: uWs.TemplatedApp;
    socket: uWs.us_listen_socket;
    port: number;
  }>((resolve) => {
    app.listen('0.0.0.0', 8005, (socket) => {
      resolve({
        server: app,
        socket,
        port: 8005,
      });
    });
  });

  const client = createTRPCClient<typeof router>({
    url: `http://localhost:${port}/trpc`,

    AbortController: AbortController as any,
    fetch: fetch as any,
    headers: {
      authorization: 'meow',
    },
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        try {
          uWs.us_listen_socket_close(socket);
        } catch (error) {
          reject();
        }
        resolve();
      }),
    port,
    router,
    client,
  };
}

let t: trpc.inferAsyncReturnType<typeof startServer>;
beforeAll(async () => {
  t = await startServer();
});
afterAll(async () => {
  await t.close();
});

test('simple query', async () => {
  expect(
    await t.client.query('hello', {
      who: 'test',
    }),
  ).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);

  // t.client.runtime.headers()

  expect(await t.client.query('hello')).toMatchInlineSnapshot(`
    Object {
      "text": "hello KATT",
    }
  `);
});

// Error status codes are correct
test('error handling', async () => {
  expect(t.client.query('error', null)).rejects.toThrowError(
    'error as expected',
  );
});

test('simple mutation', async () => {
  expect(
    await t.client.mutation('test', {
      value: 'lala',
    }),
  ).toMatchInlineSnapshot(`
    Object {
      "originalValue": "lala",
      "user": Object {
        "name": "KATT",
      },
    }
  `);
});
