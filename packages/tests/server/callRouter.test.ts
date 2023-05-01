import './___packages';
import { initTRPC } from '@trpc/server';

test('deprecated: call proc directly', async () => {
  const t = initTRPC.create();
  const router = t.router({
    sub: t.router({
      hello: t.procedure.query(() => 'hello'),
    }),
  });

  const result = await router.sub.hello({
    ctx: {},
    path: 'asd',
    type: 'query',
    requestUtils: {
      getHeaders() {
        return {};
      },
      getBodyStream() {
        throw new Error('Not Implemented / Supported');
      },
    },
    rawInput: {},
  });

  expect(result).toBe('hello');
});
