import { ZodError } from 'zod';
import { routerToServerAndClient } from './_testHelpers';
import * as trpc from '../src';
import * as z from 'zod';

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
  {
    let err: Error | null = null;
    try {
      await client.query('err');
    } catch (_err) {
      err = _err;
    }
    if (!err) {
      throw new Error('Did not throw');
    }
  }
  expect(onError).toHaveBeenCalledTimes(1);
  const err = onError.mock.calls[0][0];
  expect(err.statusCode).toBe(500);
  expect(err.originalError).toBeInstanceOf(MyError);
  expect(err.path).toBe('err');
  expect(err.procedureType).toBe('query');

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
  {
    let err: Error | null = null;
    try {
      await client.mutation('err', (1 as any) as string);
    } catch (_err) {
      err = _err;
    }
    if (!err) {
      throw new Error('Did not throw');
    }
  }
  expect(onError).toHaveBeenCalledTimes(1);
  const err = onError.mock.calls[0][0];
  expect(err.statusCode).toBe(400);
  expect(err.originalError).toBeInstanceOf(ZodError);
  expect(err.path).toBe('err');
  expect(err.procedureType).toBe('mutation');

  close();
});
