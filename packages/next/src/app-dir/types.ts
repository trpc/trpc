import type { Resolver } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  AnySubscriptionProcedure,
  inferProcedureInput,
  ProcedureRouterRecord,
} from '@trpc/server/unstable-core-do-not-import';

export type DecorateProcedureServer<
  TProcedure extends AnyProcedure,
  TRoot extends AnyRootTypes,
> = TProcedure extends AnyQueryProcedure
  ? {
      query: Resolver<TProcedure, TRoot>;
      revalidate: (
        input?: inferProcedureInput<TProcedure>,
      ) => Promise<
        { revalidated: false; error: string } | { revalidated: true }
      >;
    }
  : TProcedure extends AnyMutationProcedure
  ? {
      mutate: Resolver<TProcedure, TRoot>;
    }
  : TProcedure extends AnySubscriptionProcedure
  ? {
      subscribe: Resolver<TProcedure, TRoot>;
    }
  : never;

export type NextAppDirDecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
  TRoot extends AnyRootTypes,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? NextAppDirDecoratedProcedureRecord<
        TProcedures[TKey]['_def']['record'],
        TRoot
      >
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedureServer<TProcedures[TKey], TRoot>
    : never;
};
