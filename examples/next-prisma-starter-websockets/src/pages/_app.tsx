import { getSession, Provider } from 'next-auth/client';
import { AppType } from 'next/dist/shared/lib/utils';
import { trpc } from 'utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <Provider session={pageProps.session}>
      <Component {...pageProps} />
    </Provider>
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
