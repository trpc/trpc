import '../styles/global.css';
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
     * The import is dynamic so that `[...nextauth].ts` is only evaluated when
     * a request actually hits this branch - importing it statically evaluates
     * it while `next build` collects page data, where a missing GitHub client
     * id throws.
     */
    const { getServerAuthSession } = await import('~/server/auth');

    return {
      session: await getServerAuthSession(ctx.req, ctx.res),
    };
  }

  return {
    session: await getSession(),
  };
};

export default trpc.withTRPC(MyApp);
