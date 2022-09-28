import { routerToServerAndClientNew } from '../___testHelpers';
import * as trpc from '@trpc/server';
import { z } from 'zod';

const ignoreErrors = async (fn: () => Promise<void> | void) => {
  try {
    await Promise.reject(new Error('foo'));
  } catch {
    // ignore
  }
};
test('createCaller', async () => {
  interface Context {
    userId: string;
  }

  const createRouterWithContext = () => trpc.router<Context>();

  const createRouter = createRouterWithContext;

  const legacyRouter = createRouter()
    .mutation('withInput', {
      input: z.string(),
      resolve: () => 'this is a test',
    })
    .mutation('noInput', {
      resolve: () => 'this is also a test',
    });

  const router = legacyRouter.interop();

  const opts = routerToServerAndClientNew(router);

  const caller = opts.router.createCaller({ userId: 'user1' });

  expect(
    await caller.mutation('withInput', 'hello world'),
  ).toMatchInlineSnapshot(`"this is a test"`);

  expect(await opts.client.mutation('withInput', 'foo')).toMatchInlineSnapshot(
    `"this is a test"`,
  );

  await ignoreErrors(async () => {
    // @ts-expect-error this should complain
    await caller.mutation('withInput');

    // @ts-expect-error this should complain
    await caller.mutation('withInput');

    await caller.mutation('noInput');

    // @ts-expect-error this should complain
    await caller.mutation('noInput', 'this has no input');
  });

  await opts.close();
});
