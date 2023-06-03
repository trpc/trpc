import { createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import { createServerSideHelpers } from '@trpc/react-query/server';
import type { GetStaticPropsContext } from 'next';
import SuperJSON from 'superjson';
import { AppRouter } from './routers/_app';

export async function ssgInit<TParams extends { locale?: string }>(
  opts: GetStaticPropsContext<TParams>,
) {
  const untypedClient = createTRPCUntypedClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://localhost:3000/api/trpc',
      }),
    ],
    transformer: SuperJSON,
  });

  const ssg = createServerSideHelpers<AppRouter>({
    type: 'client',
    client: untypedClient,
    transformer: SuperJSON,
  });

  // Prefetch i18n everytime
  await ssg.i18n.fetch();

  return ssg;
}
