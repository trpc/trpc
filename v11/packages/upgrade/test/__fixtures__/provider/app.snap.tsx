import type { AppType } from 'next/app';
import { withTRPC } from './next';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC(MyApp);
