import '../styles/global.css';
import { getSession, SessionProvider } from 'next-auth/react';
import { AppType } from 'next/dist/shared/lib/utils';
import { trpc } from 'utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <SessionProvider session={(pageProps as any).session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
};

MyApp.getInitialProps = async ({ ctx }) => {
  return {
    pageProps: {
      session: await getSession(ctx),
    },
  };
};

export default trpc.withTRPC(MyApp);
