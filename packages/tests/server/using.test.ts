import { expect, test } from 'vitest';

test('should handle async disposable resources', async () => {

  const resource = {
    [Symbol.asyncDispose]: async () => {
      // do nothing
    },
    value: 42,
  };

  await using thing = resource;

  expect(thing.value).toBe(42);
});
