import { expect, test } from 'vitest';

test('should handle async disposable resources', async () => {
  let disposed = false;

  const resource = {
    [Symbol.asyncDispose]: async () => {
      disposed = true;
    },
    value: 42,
  };

  await using thing = resource;
  expect(disposed).toBe(false);
  expect(thing.value).toBe(42);
});
