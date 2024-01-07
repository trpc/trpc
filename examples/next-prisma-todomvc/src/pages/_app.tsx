import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { SSRConfig } from 'next-i18next';
import { appWithTranslation } from 'next-i18next';
import type { AppProps } from 'next/app';
import type { ComponentProps } from 'react';
import { trpc } from '../utils/trpc';

const I18nextAdapter = appWithTranslation<
  AppProps<SSRConfig> & { children: React.ReactNode }
>(({ children }) => <>{children}</>);

const I18nProvider = (props: AppProps) => {
  const _i18n = trpc.i18n.useQuery(undefined, {
    trpc: { context: { skipBatch: true } },
  });

  const locale = _i18n.data?.locale;
  const i18n = _i18n.data?.i18n;

  const passedProps = {
    ...props,
    pageProps: {
      ...props.pageProps,
      ...i18n,
    },
    router: locale ? { locale } : props.router,
  } as unknown as ComponentProps<typeof I18nextAdapter>;
  return <I18nextAdapter {...passedProps} />;
};

const MyApp = ({ Component, pageProps }: AppProps) => {
  return (
    <I18nProvider {...pageProps}>
      <Component {...pageProps} />
      <ReactQueryDevtools initialIsOpen={false} />
    </I18nProvider>
  );
};

export default trpc.withTRPC(MyApp);
