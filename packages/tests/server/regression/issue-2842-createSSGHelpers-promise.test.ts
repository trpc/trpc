import '../___packages';
import { createProxySSGHelpers } from '@trpc/react-query/ssg';
import { initTRPC } from '@trpc/server';

test('createSSGPromise', async () => {
  const t = initTRPC.create();

  const router = t.router({
    foo: t.procedure.query(() => 'bar'),
  });
  async function createSSGProxy() {
    return createProxySSGHelpers({
      router,
      ctx: {},
    });
  }

  const ssg = await createSSGProxy();

  const foo = await ssg.foo.fetch();
  expect(foo).toBe('bar');
});
