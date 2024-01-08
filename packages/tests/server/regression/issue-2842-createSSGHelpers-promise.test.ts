import { createServerSideHelpers } from '@trpc/react-query/server';
import { initTRPC } from '@trpc/server';

test('createSSGPromise', async () => {
  const t = initTRPC.create();

  const router = t.router({
    foo: t.procedure.query(() => 'bar'),
  });
  async function createSSGProxy() {
    return createServerSideHelpers({
      router,
      ctx: {},
    });
  }

  const ssg = await createSSGProxy();

  const foo = await ssg.foo.fetch();
  expect(foo).toBe('bar');
});
