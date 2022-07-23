import { LoaderArgs } from '@remix-run/node';
import { AnyRouter } from '@trpc/server';

export const createTRPCLoader =
  <TRouter extends AnyRouter>(
    router: TRouter,
  ): ((args: LoaderArgs) => ReturnType<TRouter['createCaller']>) =>
  ({ request: req }) => {
    return router.createCaller({ req }) as ReturnType<TRouter['createCaller']>;
  };
