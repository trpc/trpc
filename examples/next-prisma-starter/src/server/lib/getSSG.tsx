/**
 * Given we're this file something like `pages/posts/[id].tsx`
 */
import { createSSGHelpers } from '@trpc/react/ssg';
import { GetStaticPropsContext } from 'next';
import type { ParsedUrlQuery } from 'querystring';
import { appRouter } from 'server/routers/_app';
import superjson from 'superjson';

function createSSG() {
  return createSSGHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson, // optional - adds superjson serialization
  });
}
type SSGHelper = ReturnType<typeof createSSG>;

export function getSSG<TQuery extends ParsedUrlQuery, TProps>(
  callback: (opts: {
    ssg: SSGHelper;
    context: GetStaticPropsContext<TQuery>;
  }) => Promise<{ props: TProps }>,
) {
  return async function getStaticProps(context: GetStaticPropsContext<TQuery>) {
    const ssg = createSSGHelpers({
      router: appRouter,
      ctx: {} as any,
      transformer: superjson, // optional - adds superjson serialization
    });

    const { props, ...other } = await callback({ ssg, context });

    return {
      ...other,
      props: {
        ...props,
        trpcState: ssg.dehydrate(),
      },
    };
  };
}
