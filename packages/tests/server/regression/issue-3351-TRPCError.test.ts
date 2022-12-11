import '../___testHelpers';
import { TRPCError } from '@trpc/server';

test('TRPCError cause', async () => {
  const err = new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
  });
  expect(err.cause).toBeUndefined();
});
