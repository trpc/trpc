import '../styles/global.css';
import type { Session } from 'next-auth';
import { getSession, SessionProvider } from 'next-auth/react';
import type { AppContext, AppInitialProps, AppProps } from 'next/app';
import { withTRPC } from '~/utils/trpc';

type PageProps = { session: Session | null };

const MyApp = ({ Component, pageProps }: AppProps<PageProps>) => {
  return (
    <SessionProvider session={pageProps.session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
};

/**
 * Next.js reads `pageProps` from what this returns, and adds the page's
 * `getServerSideProps` props to it
 */
MyApp.getInitialProps = async ({
  ctx,
}: AppContext): Promise<AppInitialProps<PageProps>> => {
  if (ctx.req && ctx.res) {
    /**
     * The import is dynamic so that `[...nextauth].ts` is only evaluated when
     * a request actually hits this branch - importing it statically evaluates
     * it while `next build` collects page data, where a missing GitHub client
     * id throws.
     */
    const { getServerAuthSession } = await import('~/server/auth');

    return {
      pageProps: { session: await getServerAuthSession(ctx.req, ctx.res) },
    };
  }

  return {
    pageProps: { session: await getSession() },
  };
};

export default withTRPC(MyApp);
