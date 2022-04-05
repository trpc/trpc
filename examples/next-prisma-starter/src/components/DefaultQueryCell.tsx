import { TRPCClientErrorLike } from '@trpc/client';
import NextError from 'next/error';
import type { AppRouter } from '~/server/routers/_app';
import { createQueryCell } from '~/utils/createQueryCell';

const Loading = () => (
  <div>
    <em>Loading...</em>
  </div>
);
type TError = TRPCClientErrorLike<AppRouter>;
export const DefaultQueryCell = createQueryCell<TError>({
  error: (result) => (
    <NextError
      title={result.error.message}
      statusCode={result.error.data?.httpStatus ?? 500}
    />
  ),
  idle: () => <Loading />,
  loading: () => <Loading />,
});
