import { TRPCClientError } from '@trpc/client';

test('test passing non error like object to TRPCClientError.from', () => {
  const cause = null;

  expect(TRPCClientError.from(cause as any)).toMatchInlineSnapshot(
    '[TRPCClientError: Unknown error]',
  );
});

test('empty obj', () => {
  const cause = {};

  expect(TRPCClientError.from(cause as any)).toMatchInlineSnapshot(
    '[TRPCClientError: Unknown error]',
  );
});
