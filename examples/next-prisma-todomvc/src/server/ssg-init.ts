import { createServerSideHelpers } from '@trpc/react-query/server';
import type { GetStaticPropsContext } from 'next';
import { i18n } from 'next-i18next.config';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import SuperJSON from 'superjson';
import { createInnerTRPCContext } from './context';
import type { AppRouter } from './routers/_app';
import { appRouter } from './routers/_app';

export async function ssgInit<TParams extends { locale?: string }>(
  opts: GetStaticPropsContext<TParams>,
) {
  // Using an external TRPC app
  // const client = createTRPCClient<AppRouter>({
  //   links: [
  //     httpBatchLink({
  //       url: 'http://localhost:3000/api/trpc',
  //     }),
  //   ],
  //   transformer: SuperJSON,
  // });

  // const ssg = createServerSideHelpers({
  //   client,
  // })

  const locale = opts.params?.locale ?? opts?.locale ?? i18n.defaultLocale;
  const _i18n = await serverSideTranslations(locale, ['common']);

  const ssg = createServerSideHelpers<AppRouter>({
    router: appRouter,
    ctx: await createInnerTRPCContext({
      locale,
      i18n: _i18n,
    }),
    transformer: SuperJSON,
  });

  // Prefetch i18n everytime
  await ssg.i18n.fetch();

  return ssg;
}
