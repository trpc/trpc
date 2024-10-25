import { appRouter } from '#router.js';
import { createCallerFactory } from '#trpc.js';
import { expect, it } from 'vitest';

const createCaller = createCallerFactory(appRouter);

it('should greet the user', async () => {
  const context = {};
  const caller = createCaller(context);

  const res = await caller.greeting({
    name: 'tRPC user',
  });

  expect(res.text).toBe('hello tRPC user');
});
