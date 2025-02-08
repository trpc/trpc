/* eslint-disable @typescript-eslint/no-empty-function */
import http from 'http';
import { routerToServerAndClientNew, waitError } from './___testHelpers';
import type { TRPCLink } from '@trpc/client';
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  TRPCClientError,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import type { HTTPErrorHandler } from '@trpc/server/http';
import { observable } from '@trpc/server/observable';
import { isObject } from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import fetch from 'node-fetch';
import { z, ZodError } from 'zod';

function getMessageFromUnknownError(err: unknown, fallback: string): string {
  if (typeof err === 'string') {
    return err;
  }
  if (isObject(err) && typeof err['message'] === 'string') {
    return err['message'];
  }
  return fallback;
}

test('basic', async () => {
  class MyError extends Error {
    constructor(message: string) {
      super(message);
      Object.setPrototypeOf(this, MyError.prototype);
    }
  }
  const t = initTRPC.create();

  const router = t.router({
    err: t.procedure.query(() => {
      throw new MyError('woop');
    }),
  });

  const onError = vi.fn();
  const { close, client } = routerToServerAndClientNew(router, {
    server: {
      onError,
    },
  });
  const clientError = await waitError(client.err.query(), TRPCClientError);
  expect(clientError.shape.message).toMatchInlineSnapshot(`"woop"`);
  expect(clientError.shape.code).toMatchInlineSnapshot(`-32603`);

  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;

  expect(serverError).toBeInstanceOf(TRPCError);
  if (!(serverError instanceof TRPCError)) {
    throw new Error('Wrong error');
  }

  expect(serverError.cause).toBeInstanceOf(MyError);

  await close();
});

test('input error', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();

  const router = t.router({
    err: t.procedure.input(z.string()).mutation(() => {
      return null;
    }),
  });
  const { close, client } = routerToServerAndClientNew(router, {
    server: {
      onError,
    },
  });
  const clientError = await waitError(
    client.err.mutate(1 as any),
    TRPCClientError,
  );
  expect(clientError.shape.message).toMatchInlineSnapshot(`
    "[
      {
        "code": "invalid_type",
        "expected": "string",
        "received": "number",
        "path": [],
        "message": "Expected string, received number"
      }
    ]"
  `);
  expect(clientError.shape.code).toMatchInlineSnapshot(`-32600`);

  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;

  // if (!(serverError instanceof TRPCError)) {
  //   console.log('err', serverError);
  //   throw new Error('Wrong error');
  // }

  expect(serverError.cause).toBeInstanceOf(ZodError);

  await close();
});

test('unauthorized()', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();

  const router = t.router({
    err: t.procedure.query(() => {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }),
  });
  const { close, client } = routerToServerAndClientNew(router, {
    server: {
      onError,
    },
  });
  const clientError = await waitError(client.err.query(), TRPCClientError);
  expect(clientError).toMatchInlineSnapshot(`[TRPCClientError: UNAUTHORIZED]`);
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;

  expect(serverError).toBeInstanceOf(TRPCError);

  await close();
});

test('getMessageFromUnknownError()', () => {
  expect(getMessageFromUnknownError('test', 'nope')).toBe('test');
  expect(getMessageFromUnknownError(1, 'test')).toBe('test');
  expect(getMessageFromUnknownError({}, 'test')).toBe('test');
});
describe('formatError()', () => {
  test('simple', async () => {
    const onError = vi.fn();
    const t = initTRPC.create({
      errorFormatter({ shape, error }) {
        if (error.cause instanceof ZodError) {
          return {
            ...shape,
            data: {
              ...shape.data,
              type: 'zod' as const,
              errors: error.cause.errors,
            },
          };
        }
        return shape;
      },
    });

    const router = t.router({
      err: t.procedure.input(z.string()).mutation(() => {
        return null;
      }),
    });

    const { close, client } = routerToServerAndClientNew(router, {
      server: {
        onError,
      },
    });
    const clientError = await waitError(
      client.err.mutate(1 as any),
      TRPCClientError,
    );
    delete clientError.data.stack;
    expect(clientError.data).toMatchInlineSnapshot(`
Object {
  "code": "BAD_REQUEST",
  "errors": Array [
    Object {
      "code": "invalid_type",
      "expected": "string",
      "message": "Expected string, received number",
      "path": Array [],
      "received": "number",
    },
  ],
  "httpStatus": 400,
  "path": "err",
  "type": "zod",
}
`);
    expect(clientError.shape).toMatchInlineSnapshot(`
      Object {
        "code": -32600,
        "data": Object {
          "code": "BAD_REQUEST",
          "errors": Array [
            Object {
              "code": "invalid_type",
              "expected": "string",
              "message": "Expected string, received number",
              "path": Array [],
              "received": "number",
            },
          ],
          "httpStatus": 400,
          "path": "err",
          "type": "zod",
        },
        "message": "[
        {
          "code": "invalid_type",
          "expected": "string",
          "received": "number",
          "path": [],
          "message": "Expected string, received number"
        }
      ]",
      }
    `);
    expect(onError).toHaveBeenCalledTimes(1);
    const serverError = onError.mock.calls[0]![0]!.error;

    expect(serverError.cause).toBeInstanceOf(ZodError);

    await close();
  });

  test('setting custom http response code', async () => {
    const TEAPOT_ERROR_CODE = 418;
    const onError = vi.fn();
    const t = initTRPC.create({
      errorFormatter: ({ error, shape }) => {
        if (!(error.cause instanceof ZodError)) {
          return shape;
        }
        return {
          ...shape,
          data: {
            ...shape.data,
            httpStatus: TEAPOT_ERROR_CODE,
          },
        };
      },
    });

    const router = t.router({
      q: t.procedure.input(z.string()).query(() => null),
    });

    const { close, httpUrl } = routerToServerAndClientNew(router, {
      server: {
        onError,
      },
    });
    const res = await fetch(`${httpUrl}/q`);

    expect(res.ok).toBeFalsy();
    expect(res.status).toBe(TEAPOT_ERROR_CODE);

    await close();
  });

  test('do not override response status set by middleware or resolver', async () => {
    const TEAPOT_ERROR_CODE = 418;
    const onError = vi.fn();
    const t = initTRPC.context<CreateHTTPContextOptions>().create({});
    const middleware = t.middleware(({ ctx }) => {
      ctx.res.statusCode = TEAPOT_ERROR_CODE;
      throw new Error('Some error');
    });

    const router = t.router({
      q: t.procedure.use(middleware).query(() => null),
    });

    const { close, httpUrl } = routerToServerAndClientNew(router, {
      server: {
        onError,
      },
    });
    const res = await fetch(`${httpUrl}/q`);

    expect(res.ok).toBeFalsy();
    expect(res.status).toBe(TEAPOT_ERROR_CODE);

    await close();
  });
});

test('make sure object is ignoring prototype', async () => {
  const onError = vi.fn();
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'there'),
  });

  const { close, client } = routerToServerAndClientNew(router, {
    server: {
      onError,
    },
  });
  const clientError = await waitError(
    (client as any).toString.query(),
    TRPCClientError,
  );
  expect(clientError.shape.message).toMatchInlineSnapshot(
    `"No procedure found on path "toString""`,
  );
  expect(clientError.shape.code).toMatchInlineSnapshot(`-32004`);
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;
  expect(serverError.code).toMatchInlineSnapshot(`"NOT_FOUND"`);

  await close();
});

test('allow using built-in Object-properties', async () => {
  const t = initTRPC.create();
  const router = t.router({
    toString: t.procedure.query(() => 'toStringValue'),
    hasOwnProperty: t.procedure.query(() => 'hasOwnPropertyValue'),
  });

  const { close, client } = routerToServerAndClientNew(router);

  expect(await client.toString.query()).toBe('toStringValue');
  expect(await client.hasOwnProperty.query()).toBe('hasOwnPropertyValue');
  await close();
});

test('retain stack trace', async () => {
  class CustomError extends Error {
    constructor() {
      super('CustomError.msg');
      this.name = 'CustomError';

      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  const onErrorFn: HTTPErrorHandler<any, any> = () => {};

  const onError = vi.fn(onErrorFn);

  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure.query(() => {
      if (true) {
        throw new CustomError();
      }

      return 'toStringValue';
    }),
  });

  const { close, client } = routerToServerAndClientNew(router, {
    server: {
      onError,
    },
  });

  const clientError = await waitError(() => client.hello.query());
  expect(clientError.name).toBe('TRPCClientError');

  expect(onError).toHaveBeenCalledTimes(1);

  const serverOnErrorOpts = onError.mock.calls[0]![0];
  const serverError = serverOnErrorOpts.error;
  expect(serverError).toBeInstanceOf(TRPCError);
  expect(serverError.cause).toBeInstanceOf(CustomError);

  expect(serverError.stack).not.toContain('getErrorFromUnknown');
  const stackParts = serverError.stack!.split('\n');

  // first line of stack trace
  expect(stackParts[1]).toContain(__filename);

  await close();
});

describe('links have meta data about http failures', async () => {
  type Handler = (opts: {
    req: http.IncomingMessage;
    res: http.ServerResponse;
  }) => void;

  function createServer(handler: Handler) {
    const server = http.createServer((req, res) => {
      handler({ req, res });
    });
    server.listen(0);

    const port = (server.address() as any).port as number;

    return {
      url: `http://localhost:${port}`,
      async close() {
        await new Promise((resolve) => {
          server.close(resolve);
        });
      },
    };
  }
  const ctx = konn()
    .beforeEach(() => {
      return {
        server: createServer(({ res }) => {
          res.setHeader('content-type', 'application/json');
          res.write(
            JSON.stringify({
              __error: {
                foo: 'bar',
              },
            }),
          );
          res.end();
        }),
      };
    })
    .afterEach((opts) => {
      opts.server?.close();
    })
    .done();
  test('httpLink', async () => {
    let meta = undefined as Record<string, unknown> | undefined;

    const client: any = createTRPCClient<any>({
      links: [
        () => {
          return ({ next, op }) => {
            return observable((observer) => {
              const unsubscribe = next(op).subscribe({
                error(err) {
                  observer.error(err);
                  meta = err.meta;
                },
              });
              return unsubscribe;
            });
          };
        },
        httpLink({
          url: ctx.server.url,
          fetch: fetch as any,
        }),
      ],
    });

    const error = await waitError(client.test.query(), TRPCClientError);
    expect(error).toMatchInlineSnapshot(
      `[TRPCClientError: Unable to transform response from server]`,
    );

    expect(meta).not.toBeUndefined();
    expect(meta?.['responseJSON']).not.toBeFalsy();
    expect(meta?.['responseJSON']).not.toBeFalsy();
    expect(meta?.['responseJSON']).toMatchInlineSnapshot(`
      Object {
        "__error": Object {
          "foo": "bar",
        },
      }
    `);
  });

  test('httpBatchLink', async () => {
    let meta = undefined as Record<string, unknown> | undefined;

    const client: any = createTRPCClient<any>({
      links: [
        () => {
          return ({ next, op }) => {
            return observable((observer) => {
              const unsubscribe = next(op).subscribe({
                error(err) {
                  observer.error(err);
                  meta = err.meta;
                },
              });
              return unsubscribe;
            });
          };
        },
        httpBatchLink({
          url: ctx.server.url,
          fetch: fetch as any,
        }),
      ],
    });

    const error = await waitError(client.test.query(), TRPCClientError);
    expect(error).toMatchInlineSnapshot(
      `[TRPCClientError: Unable to transform response from server]`,
    );

    expect(meta).not.toBeUndefined();
    expect(meta?.['responseJSON']).not.toBeFalsy();
    expect(meta?.['responseJSON']).not.toBeFalsy();
    expect(meta?.['responseJSON']).toMatchInlineSnapshot(`
      Object {
        "__error": Object {
          "foo": "bar",
        },
      }
    `);
  });

  test('rethrow custom error', async () => {
    type AppRouter = any;
    class MyCustomError extends TRPCClientError<AppRouter> {
      constructor(message: string) {
        super(message);

        Object.setPrototypeOf(this, new.target.prototype);
      }
    }

    const customErrorLink: TRPCLink<AppRouter> = (_runtime) => (opts) =>
      observable((observer) => {
        const unsubscribe = opts.next(opts.op).subscribe({
          error(err) {
            if (
              err.meta &&
              isObject(err.meta['responseJSON']) &&
              '__error' in err.meta['responseJSON'] // <----- you need to modify this
            ) {
              // custom error handling
              observer.error(
                new MyCustomError(
                  `custom error: ${JSON.stringify(
                    err.meta['responseJSON']['__error'],
                  )}`,
                ),
              );
            }
            observer.error(err);
          },
        });
        return unsubscribe;
      });

    const client: any = createTRPCClient<any>({
      links: [
        customErrorLink,
        httpLink({
          url: ctx.server.url,
          fetch: fetch as any,
        }),
      ],
    });

    const error = await waitError(client.test.query());

    expect(error).toMatchInlineSnapshot(
      '[TRPCClientError: custom error: {"foo":"bar"}]',
    );

    expect(error).toBeInstanceOf(TRPCClientError);
    expect(error).toBeInstanceOf(MyCustomError);
  });
});
