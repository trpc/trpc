import { createProxySSGHelpers } from '@trpc/react-query/ssg';
import type { GetStaticPropsContext } from 'next';
import { i18n } from 'next-i18next.config';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import SuperJSON from 'superjson';
import { createInnerTRPCContext } from './context';
import { appRouter } from './routers/_app';

export async function ssgInit<TParams extends { locale?: string }>(
  opts: GetStaticPropsContext<TParams>,
) {
  const locale = opts.params?.locale ?? opts?.locale ?? i18n.defaultLocale;
  console.log({ opts });
  const _i18n = await serverSideTranslations(locale, ['common']);

  const ssg = createProxySSGHelpers({
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
