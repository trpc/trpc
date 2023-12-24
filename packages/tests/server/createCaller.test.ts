import { z } from 'zod';
import './___packages';
import { ignoreErrors } from './___testHelpers';
import { initTRPC } from '@trpc/server/src/core';

const t = initTRPC.context<{ foo: 'foo' }>().create();

const appRouter = t.router({
  hello: t.procedure
    .input(
      z.object({
        who: z.string(),
      }),
    )
    .query((opts) => `hello ${opts.input.who}` as const),
});

const createCaller = t.createCallerFactory(appRouter);

test('happy path', async () => {
  const caller = createCaller({
    foo: 'foo',
  });

  expect(await caller.hello({ who: 'world' })).toEqual('hello world');
});

test('context mismatch', async () => {
  const anotherRouter = initTRPC
    .context<{ moo: 'moo' }>()
    .create()
    .router({
      hello: t.procedure
        .input(
          z.object({
            who: z.string(),
          }),
        )
        .query((opts) => `hello ${opts.input.who}` as const),
    });

  ignoreErrors(() => {
    // @ts-expect-error wrong context
    t.createCallerFactory(anotherRouter);
  });
});
