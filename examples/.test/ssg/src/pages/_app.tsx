import type { AppType } from 'next/app';
import { trpc } from '../utils/trpc';

const MyApp: AppType = (props) => {
  return <props.Component {...props.pageProps} />;
};

export default trpc.withTRPC(MyApp);
