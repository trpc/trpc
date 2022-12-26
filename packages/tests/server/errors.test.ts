/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { TRPCClientError } from '@trpc/client/src';
import * as trpc from '@trpc/server/src';
import { initTRPC } from '@trpc/server/src';
import { CreateHTTPContextOptions } from '@trpc/server/src/adapters/standalone';
import { TRPCError } from '@trpc/server/src/error/TRPCError';
import { getMessageFromUnknownError } from '@trpc/server/src/error/utils';
import { OnErrorFunction } from '@trpc/server/src/internals/types';
import fetch from 'node-fetch';
import { ZodError, z } from 'zod';

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

  const onError = jest.fn();
  const { close, proxy } = routerToServerAndClientNew(router, {
    server: {
      onError,
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

test('input error', async () => {
  const onError = jest.fn();
  const t = initTRPC.create();

  const router = t.router({
    err: t.procedure.input(z.string()).mutation(() => {
      return null;
    }),
  });
  const { close, proxy } = routerToServerAndClientNew(router, {
    server: {
      onError,
    },
  });
  const clientError = await waitError(
    proxy.err.mutate(1 as any),
    TRPCClientError,
  );
  expect(clientError.shape.message).toMatchInlineSnapshot(`
    "[
      {
        \\"code\\": \\"invalid_type\\",
        \\"expected\\": \\"string\\",
        \\"received\\": \\"number\\",
        \\"path\\": [],
        \\"message\\": \\"Expected string, received number\\"
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

  close();
});

test('unauthorized()', async () => {
  const onError = jest.fn();
  const t = initTRPC.create();

  const router = t.router({
    err: t.procedure.query(() => {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }),
  });
  const { close, proxy } = routerToServerAndClientNew(router, {
    server: {
      onError,
    },
  });
  const clientError = await waitError(proxy.err.query(), TRPCClientError);
  expect(clientError).toMatchInlineSnapshot(`[TRPCClientError: UNAUTHORIZED]`);
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;

  expect(serverError).toBeInstanceOf(TRPCError);

  close();
});

test('getMessageFromUnkownError()', () => {
  expect(getMessageFromUnknownError('test', 'nope')).toBe('test');
  expect(getMessageFromUnknownError(1, 'test')).toBe('test');
  expect(getMessageFromUnknownError({}, 'test')).toBe('test');
});
describe('formatError()', () => {
  test('simple', async () => {
    const onError = jest.fn();
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

    const { close, proxy } = routerToServerAndClientNew(router, {
      server: {
        onError,
      },
    });
    const clientError = await waitError(
      proxy.err.mutate(1 as any),
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
    \\"code\\": \\"invalid_type\\",
    \\"expected\\": \\"string\\",
    \\"received\\": \\"number\\",
    \\"path\\": [],
    \\"message\\": \\"Expected string, received number\\"
  }
]",
}
`);
    expect(onError).toHaveBeenCalledTimes(1);
    const serverError = onError.mock.calls[0]![0]!.error;

    expect(serverError.cause).toBeInstanceOf(ZodError);

    close();
  });

  test('double errors', async () => {
    expect(() => {
      trpc
        .router()
        .formatError(({ shape }) => {
          return shape;
        })
        .formatError(({ shape }) => {
          return shape;
        });
    }).toThrowErrorMatchingInlineSnapshot(
      `"You seem to have double \`formatError()\`-calls in your router tree"`,
    );
  });
  test('setting custom http response code', async () => {
    const TEAPOT_ERROR_CODE = 418;
    const onError = jest.fn();
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

    close();
  });

  test('do not override response status set by middleware or resolver', async () => {
    const TEAPOT_ERROR_CODE = 418;
    const onError = jest.fn();
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

    close();
  });
});

test('make sure object is ignoring prototype', async () => {
  const onError = jest.fn();
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'there'),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    server: {
      onError,
    },
  });
  const clientError = await waitError(
    (proxy as any).toString.query(),
    TRPCClientError,
  );
  expect(clientError.shape.message).toMatchInlineSnapshot(
    `"No \\"query\\"-procedure on path \\"toString\\""`,
  );
  expect(clientError.shape.code).toMatchInlineSnapshot(`-32004`);
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0]![0]!.error;
  expect(serverError.code).toMatchInlineSnapshot(`"NOT_FOUND"`);

  close();
});

test('allow using built-in Object-properties', async () => {
  const t = initTRPC.create();
  const router = t.router({
    toString: t.procedure.query(() => 'toStringValue'),
    hasOwnProperty: t.procedure.query(() => 'hasOwnPropertyValue'),
  });

  const { close, proxy } = routerToServerAndClientNew(router);

  expect(await proxy.toString.query()).toBe('toStringValue');
  expect(await proxy.hasOwnProperty.query()).toBe('hasOwnPropertyValue');
  close();
});

test('retain stack trace', async () => {
  class CustomError extends Error {
    constructor() {
      super('CustomError.msg');
      this.name = 'CustomError';

      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  const onErrorFn: OnErrorFunction<any, any> = () => {};

  const onError = jest.fn(onErrorFn);

  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure.query(() => {
      if (true) {
        throw new CustomError();
      }

      return 'toSringValue';
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    server: {
      onError,
    },
  });

  const clientError = await waitError(() => proxy.hello.query());
  expect(clientError.name).toBe('TRPCClientError');

  expect(onError).toHaveBeenCalledTimes(1);

  const serverOnErrorOpts = onError.mock.calls[0]![0]!;
  const serverError = serverOnErrorOpts.error;
  expect(serverError).toBeInstanceOf(TRPCError);
  expect(serverError.cause).toBeInstanceOf(CustomError);

  expect(serverError.stack).not.toContain('getErrorFromUnknown');
  const stackParts = serverError.stack!.split('\n');

  // first line of stack trace
  expect(stackParts[1]).toContain(__filename);

  close();
});
