import { dehydrate } from '@tanstack/react-query';
import { createServerSideHelpers } from '@trpc/react-query/server';
import { appRouter } from '~/server/routers/_app';


export default async function Page(props: { children: React.ReactNode }) {
  // THIS THROWS useContext error
  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: {
      headers: {},
      session: null,
    },
  });

  await helpers.greeting.fetch({
    text: '__FROM RSC__',
  });
  const dehydratedState = dehydrate(helpers.queryClient);

  return (
    <html lang="en">
      <body>
        <Providers dehydrateState={dehydratedState}>{props.children}</Providers>
      </body>
    </html>
  );
}
