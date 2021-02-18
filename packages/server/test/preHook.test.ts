import { routerToServerAndClient } from './_testHelpers';
import * as trpc from '../src';
import { httpError } from '../src';

test('does not crash', async () => {
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .query('foo', {
        resolve() {
          return 'bar';
        },
      })
      .preHook(() => {}),
  );

  expect(await client.query('foo')).toBe('bar');

  close();
});
test('is called if def first', async () => {
  const preHook = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .preHook(preHook)
      .query('foo1', {
        resolve() {
          return 'bar1';
        },
      })
      .query('foo2', {
        resolve() {
          return 'bar2';
        },
      }),
  );

  expect(await client.query('foo1')).toBe('bar1');
  expect(await client.query('foo2')).toBe('bar2');
  expect(preHook).toHaveBeenCalledTimes(2);
  close();
});

test('is not called if def last', async () => {
  const preHook = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .query('foo', {
        resolve() {
          return 'bar';
        },
      })
      .preHook(preHook),
  );

  expect(await client.query('foo')).toBe('bar');
  expect(preHook).toHaveBeenCalledTimes(0);
  close();
});

test('affects child routers', async () => {
  const preHook = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .preHook(preHook)
      .query('foo1', {
        resolve() {
          return 'bar1';
        },
      })
      .merge(
        'child.',
        trpc.router().query('foo2', {
          resolve() {
            return 'bar2';
          },
        }),
      ),
  );

  expect(await client.query('foo1')).toBe('bar1');
  expect(await client.query('child.foo2')).toBe('bar2');
  expect(preHook).toHaveBeenCalledTimes(2);
  close();
});

test('allows you to throw an error (e.g. auth)', async () => {
  type Context = {
    user?: {
      id: number;
      name: string;
      isAdmin: boolean;
    };
  };
  const resolverMock = jest.fn();

  const headers: Record<string, string | undefined> = {};

  const { client, close } = routerToServerAndClient(
    trpc
      .router<Context>()
      .query('foo', {
        resolve() {
          return 'bar';
        },
      })
      .merge(
        'admin.',
        trpc
          .router<Context>()
          .preHook(({ ctx }) => {
            if (!ctx.user?.isAdmin) {
              throw httpError.unauthorized();
            }
          })
          .query('secretPlace', {
            resolve() {
              resolverMock();

              return 'a key';
            },
          }),
      ),
    {
      createContext({ req }) {
        if (req.headers.authorization === 'meow') {
          return {
            user: {
              id: 1,
              name: 'KATT',
              isAdmin: true,
            },
          };
        }
        return {};
      },
      getHeaders: () => headers,
    },
  );

  expect(await client.query('foo')).toBe('bar');
  await expect(client.query('admin.secretPlace')).rejects.toMatchObject({
    res: { status: 401 },
  });
  expect(resolverMock).toHaveBeenCalledTimes(0);
  headers.authorization = 'meow';
  expect(await client.query('admin.secretPlace')).toBe('a key');
  expect(resolverMock).toHaveBeenCalledTimes(1);
  close();
});
