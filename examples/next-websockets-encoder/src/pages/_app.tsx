import '../styles/global.css';
import { trpc } from '~/utils/trpc';
import type { AppType } from 'next/app';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default trpc.withTRPC(MyApp);
