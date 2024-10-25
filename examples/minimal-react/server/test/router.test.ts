import { appRouter } from '#router.js';
import { createCaller } from '#trpc.js';
import { expect, it } from 'vitest';

it('should return hello world', async () => {
  const context = {};
  const caller = createCaller(appRouter)(context);

  const res = await caller.greeting({
    name: 'tRPC user',
  });

  expect(res.text).toBe('hello tRPC user');
});
