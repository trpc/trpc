import { expect, test } from 'vitest';

test('should handle async disposable resources', async () => {
  let disposed = false;

  const resource = {
    [Symbol.asyncDispose]: async () => {
      disposed = true;
    },
    value: 42,
  };

  await using value = resource;
  expect(disposed).toBe(true);
  expect(value).toBe(42);
});
