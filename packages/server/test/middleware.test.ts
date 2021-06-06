import { routerToServerAndClient } from './_testHelpers';
import * as trpc from '../src';
import { httpError } from '../src';

test('is called if def first', async () => {
  const middleware = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .middleware(middleware)
      .query('foo1', {
        resolve() {
          return 'bar1';
        },
      })
      .mutation('foo2', {
        resolve() {
          return 'bar2';
        },
      }),
  );

  expect(await client.query('foo1')).toBe('bar1');
  const calls = middleware.mock.calls;
  expect(calls[0][0]).toHaveProperty('type');
  expect(calls[0][0]).toHaveProperty('ctx');
  expect(calls[0][0].type).toBe('query');
  expect(await client.mutation('foo2')).toBe('bar2');
  expect(calls[1][0].type).toBe('mutation');

  expect(middleware).toHaveBeenCalledTimes(2);
  close();
});

test('is not called if def last', async () => {
  const middleware = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .query('foo', {
        resolve() {
          return 'bar';
        },
      })
      .middleware(middleware),
  );

  expect(await client.query('foo')).toBe('bar');
  expect(middleware).toHaveBeenCalledTimes(0);
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
          .middleware(({ ctx }) => {
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
      server: {
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
      },
      client: {
        getHeaders: () => headers,
      },
    },
  );

  expect(await client.query('foo')).toBe('bar');
  await expect(client.query('admin.secretPlace')).rejects.toMatchObject({
    json: { statusCode: 401 },
  });
  expect(resolverMock).toHaveBeenCalledTimes(0);
  headers.authorization = 'meow';
  expect(await client.query('admin.secretPlace')).toBe('a key');
  expect(resolverMock).toHaveBeenCalledTimes(1);
  close();
});

test('child routers + hook call order', async () => {
  const middlewareInParent = jest.fn();
  const middlewareInChild = jest.fn();
  const middlewareInGrandChild = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .middleware(middlewareInParent)
      .query('name', {
        resolve() {
          return 'Child';
        },
      })
      .merge(
        'child.',
        trpc
          .router()
          .middleware(middlewareInChild)
          .query('name', {
            resolve() {
              return 'Child';
            },
          })
          .merge(
            'child.',
            trpc
              .router()
              .middleware(middlewareInGrandChild)
              .query('name', {
                resolve() {
                  return 'GrandChild';
                },
              }),
          ),
      ),
  );

  expect(await client.query('child.child.name')).toBe('GrandChild');
  expect(middlewareInParent).toHaveBeenCalledTimes(1);
  expect(middlewareInChild).toHaveBeenCalledTimes(1);
  expect(middlewareInGrandChild).toHaveBeenCalledTimes(1);

  // check call order
  expect(middlewareInParent.mock.invocationCallOrder[0]).toBeLessThan(
    middlewareInChild.mock.invocationCallOrder[0],
  );
  expect(middlewareInChild.mock.invocationCallOrder[0]).toBeLessThan(
    middlewareInGrandChild.mock.invocationCallOrder[0],
  );

  expect(await client.query('name')).toBe('Child');
  expect(await client.query('child.name')).toBe('Child');
  expect(await client.query('child.child.name')).toBe('GrandChild');

  close();
});

test('equiv', () => {
  type Context = {
    user?: {
      id: number;
      name: string;
      isAdmin: boolean;
    };
  };
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
        .middleware(({ ctx }) => {
          if (!ctx.user?.isAdmin) {
            throw httpError.unauthorized();
          }
        })
        .query('secretPlace', {
          resolve() {
            return 'a key';
          },
        }),
    );

  trpc
    .router<Context>()
    .query('foo', {
      resolve() {
        return 'bar';
      },
    })
    .merge(
      trpc
        .router<Context>()
        .middleware(({ ctx }) => {
          if (!ctx.user?.isAdmin) {
            throw httpError.unauthorized();
          }
        })
        .query('admin.secretPlace', {
          resolve() {
            return 'a key';
          },
        }),
    );
});
