/**
 * The v11 router type that `@trpc/client` 11 apps build against, made from
 * the v12 router (`www/docs/migrations/from-v11/serve-v11-clients.md`).
 */
import type {
  TRPCBuiltRouter,
  TRPCDefaultErrorShape,
  TRPCMutationProcedure,
  TRPCQueryProcedure,
  TRPCSubscriptionProcedure,
} from '@trpc/server';
import type {
  AnyProcedure,
  inferProcedureInput,
  inferProcedureOutput,
  Unlazy,
} from '@trpc12/trpc/server';

import type { AppRouter } from './server.ts';

type V11Record<TRouter> = {
  [K in keyof TRouter]: TRouter[K] extends AnyProcedure
    ? V11Procedure<
        TRouter[K],
        {
          input: inferProcedureInput<TRouter[K]>;
          output: inferProcedureOutput<TRouter[K]>;
          meta: object;
        }
      >
    : V11Record<Unlazy<TRouter[K]>>;
};
type V11Procedure<
  P extends AnyProcedure,
  D extends { input: unknown; output: unknown; meta: object },
> = {
  query: TRPCQueryProcedure<D>;
  mutation: TRPCMutationProcedure<D>;
  subscription: TRPCSubscriptionProcedure<
    D & { output: AsyncIterable<D['output'], void, any> }
  >;
}[P['~trpc']['type']];

/** What `@trpc/client` 11 apps are typed against. */
export type V11AppRouter = TRPCBuiltRouter<
  {
    ctx: object;
    meta: object;
    // Your errorFormatter's shape, if createV11Handler has one.
    errorShape: TRPCDefaultErrorShape;
    // true with a transformer (superjson); false types outputs as JSON.
    transformer: true;
  },
  V11Record<AppRouter>
>;
