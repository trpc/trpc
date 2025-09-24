import { initTRPC } from '@trpc/server';
import * as streamsPolyfill from 'web-streams-polyfill';

for (const [key, value] of Object.entries(streamsPolyfill)) {
  console.log('polyfilling', key);
  (globalThis as any)[key] = value;
}

test('repro', async () => {
  const t = initTRPC.create({});

  const router = t.router({
    iterable: t.procedure.query(async function* () {
      yield 1;
      yield 2;
      yield 3;

      return 'done';
    }),
    deferred: t.procedure.query(() => {
      return {
        foo: Promise.resolve('bar'),
      };
    }),
  });
});
