import { TRPCClientError } from '@trpc/client';
import type { AppRouter } from 'server/routers/app';
import { trpc } from 'utils/trpc';
import NextError from 'next/error';

/**
 * Takes a TRPCClientError and renders a `next/error`-page
 * (this component might be added to `@trpc/next`)
 */
export function ErrorPage(props: {
  error: TRPCClientError<AppRouter>;
}): JSX.Element {
  const { error } = props;
  const utils = trpc.useContext();

  const statusCode = error.shape?.data.httpStatus ?? 500;
  if (!process.browser) {
    const res = utils.ssrContext?.res;
    if (res) {
      res.statusCode = statusCode;
    }
  }

  return (
    <NextError
      title={error.shape?.message ?? error.message}
      statusCode={statusCode}
    />
  );
}
