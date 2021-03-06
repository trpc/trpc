/* eslint-disable @typescript-eslint/no-explicit-any */
import * as z from 'zod';
import { ZodError } from 'zod';
import { TRPCClientError } from '../../client/src';
import * as trpc from '../src';
import { TRPCError } from '../src/errors';
import { routerToServerAndClient } from './_testHelpers';

test('basic', async () => {
  class MyError extends Error {
    constructor(message: string) {
      super(message);
      Object.setPrototypeOf(this, MyError.prototype);
    }
  }
  const onError = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc.router().query('err', {
      resolve() {
        throw new MyError('woop');
      },
    }),
    {
      server: {
        onError,
      },
    },
  );
  let clientError: Error | null = null;
  try {
    await client.query('err');
  } catch (_err) {
    clientError = _err;
  }
  if (!(clientError instanceof TRPCClientError)) {
    throw new Error('Did not throw');
  }
  expect(clientError.res?.status).toBe(500);
  expect(clientError.json?.error.message).toMatchInlineSnapshot(`"woop"`);
  expect(clientError.json?.error.code).toMatchInlineSnapshot(
    `"INTERNAL_SERVER_ERROR"`,
  );
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0][0].err;

  expect(serverError).toBeInstanceOf(TRPCError);
  if (!(serverError instanceof TRPCError)) {
    throw new Error('Wrong error');
  }
  expect(serverError.originalError).toBeInstanceOf(MyError);

  close();
});

test('input error', async () => {
  const onError = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc.router().mutation('err', {
      input: z.string(),
      resolve() {
        return null;
      },
    }),
    {
      server: {
        onError,
      },
    },
  );
  let clientError: Error | null = null;
  try {
    await client.mutation('err', 1 as any);
  } catch (_err) {
    clientError = _err;
  }
  if (!(clientError instanceof TRPCClientError)) {
    throw new Error('Did not throw');
  }
  expect(clientError.res?.status).toBe(400);
  expect(clientError.json?.error.message).toMatchInlineSnapshot(`
    "1 validation issue(s)

      Issue #0: invalid_type at 
      Expected string, received number
    "
  `);
  expect(clientError.json?.error.code).toMatchInlineSnapshot(
    `"BAD_USER_INPUT"`,
  );
  expect(onError).toHaveBeenCalledTimes(1);
  const serverError = onError.mock.calls[0][0].err;

  // if (!(serverError instanceof TRPCError)) {
  //   console.log('err', serverError);
  //   throw new Error('Wrong error');
  // }
  expect(serverError.originalError).toBeInstanceOf(ZodError);

  close();
});
