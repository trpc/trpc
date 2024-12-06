import { createServerSideHelpers } from '@trpc/react-query/server';
import type { GetStaticPropsContext } from 'next';
import SuperJSON from 'superjson';
import { createInnerTRPCContext } from './context';
import type { AppRouter } from './routers/_app';
import { appRouter } from './routers/_app';

export async function ssgInit<TParams extends {}>(
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

  const ssg = createServerSideHelpers<AppRouter>({
    router: appRouter,
    ctx: await createInnerTRPCContext({}),
    transformer: SuperJSON,
  });

  return ssg;
}
