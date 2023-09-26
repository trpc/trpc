import { Resolver } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootConfig,
  AnyRouter,
  AnySubscriptionProcedure,
  ProcedureRouterRecord,
} from '@trpc/server';

export type DecorateProcedureServer<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = TProcedure extends AnyQueryProcedure
  ? {
      query: Resolver<TConfig, TProcedure>;
      revalidate: (
        input?: unknown,
      ) => Promise<
        { revalidated: false; error: string } | { revalidated: true }
      >;
    }
  : TProcedure extends AnyMutationProcedure
  ? {
      mutate: Resolver<TConfig, TProcedure>;
    }
  : TProcedure extends AnySubscriptionProcedure
  ? {
      subscribe: Resolver<TConfig, TProcedure>;
    }
  : never;

export type NextAppDirDecoratedProcedureRecord<
  TConfig extends AnyRootConfig,
  TProcedures extends ProcedureRouterRecord,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? NextAppDirDecoratedProcedureRecord<
        TConfig,
        TProcedures[TKey]['_def']['record']
      >
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedureServer<TConfig, TProcedures[TKey]>
    : never;
};
