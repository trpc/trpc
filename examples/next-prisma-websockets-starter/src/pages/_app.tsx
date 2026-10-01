import '../styles/global.css';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Session } from 'next-auth';
import { getSession, SessionProvider } from 'next-auth/react';
import type { AppType } from 'next/app';
import { trpc } from '~/utils/trpc';

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps,
}) => {
  return (
    <SessionProvider session={pageProps.session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
};

MyApp.getInitialProps = async ({ ctx }) => {
  if (ctx.req && ctx.res) {
    /**
     * On the server use `getServerSession` rather than the client-side
     * `getSession`, which would make an internal HTTP request to
     * `/api/auth/session` on every page load.
     *
     * The imports are dynamic so that `[...nextauth].ts` is only evaluated
     * when a request actually hits this branch - importing it statically
     * evaluates it while `next build` collects page data, where a missing
     * GitHub client id throws.
     * @see https://github.com/trpc/trpc/issues/5602
     */
    const [{ getServerSession }, { authOptions }] = await Promise.all([
      import('next-auth/next'),
      import('~/pages/api/auth/[...nextauth]'),
    ]);

    return {
      session: await getServerSession(
        ctx.req as NextApiRequest,
        ctx.res as NextApiResponse,
        authOptions,
      ),
    };
  }

  return {
    session: await getSession(),
  };
};

export default trpc.withTRPC(MyApp);
