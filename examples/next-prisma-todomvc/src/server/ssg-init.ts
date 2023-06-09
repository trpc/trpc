import { createServerSideInternalHelpers } from '@trpc/react-query/server';
import type { GetStaticPropsContext } from 'next';
import SuperJSON from 'superjson';
import { AppRouter, appRouter } from './routers/_app';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { i18n } from 'next-i18next.config';
import { createInnerTRPCContext } from './context';

export async function ssgInit<TParams extends { locale?: string }>(
  opts: GetStaticPropsContext<TParams>,
) {
  // Using an external TRPC app
  // const untypedClient = createTRPCUntypedClient<AppRouter>({
  //   links: [
  //     httpBatchLink({
  //       url: 'http://localhost:3000/api/trpc',
  //     }),
  //   ],
  //   transformer: SuperJSON,
  // });

  // const ssg = createServerSideExternalHelpers<AppRouter>({
  //   client: untypedClient,
  //   transformer: SuperJSON,
  // });

  const locale = opts.params?.locale ?? opts?.locale ?? i18n.defaultLocale;
  const _i18n = await serverSideTranslations(locale, ['common']);
  const ssg = createServerSideInternalHelpers<AppRouter>({
    router: appRouter,
    transformer: SuperJSON,
    ctx: await createInnerTRPCContext({
      locale,
      i18n: _i18n,
    }),
  });

  // Prefetch i18n everytime
  await ssg.i18n.fetch();

  return ssg;
}
