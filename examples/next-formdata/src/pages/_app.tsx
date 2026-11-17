import type { AppType } from 'next/app';
import { withTRPC } from '../utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC(MyApp);
