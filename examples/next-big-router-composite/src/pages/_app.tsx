import type { AppType } from "next/app";
import { trpc } from "../../module/trpc/shared/nextClient";

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default trpc.withTRPC(MyApp);
