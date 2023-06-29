import { Resolver } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
  ProcedureRouterRecord,
} from '@trpc/server';

export type DecorateProcedureServer<TProcedure extends AnyProcedure> =
  TProcedure extends AnyQueryProcedure
    ? {
        query: Resolver<TProcedure>;
        revalidate: (
          input?: unknown,
        ) => Promise<
          { revalidated: false; error: string } | { revalidated: true }
        >;
      }
    : TProcedure extends AnyMutationProcedure
    ? {
        mutate: Resolver<TProcedure>;
      }
    : TProcedure extends AnySubscriptionProcedure
    ? {
        subscribe: Resolver<TProcedure>;
      }
    : never;

export type NextAppDirDecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? NextAppDirDecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedureServer<TProcedures[TKey]>
    : never;
};
