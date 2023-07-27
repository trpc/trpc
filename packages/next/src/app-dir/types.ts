import { Resolver } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
} from '@trpc/server';

export type DecorateProcedureServer<
  TRouter extends AnyRouter,
  TProcedure extends AnyProcedure,
> = TProcedure extends AnyQueryProcedure
  ? {
      query: Resolver<TRouter, TProcedure>;
      revalidate: (
        input?: unknown,
      ) => Promise<
        { revalidated: false; error: string } | { revalidated: true }
      >;
    }
  : TProcedure extends AnyMutationProcedure
  ? {
      mutate: Resolver<TRouter, TProcedure>;
    }
  : TProcedure extends AnySubscriptionProcedure
  ? {
      subscribe: Resolver<TRouter, TProcedure>;
    }
  : never;

export type NextAppDirDecoratedProcedureRecord<TRouter extends AnyRouter> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? NextAppDirDecoratedProcedureRecord<
        TRouter['_def']['record'][TKey]['_def']['record']
      >
    : TRouter['_def']['record'][TKey] extends AnyProcedure
    ? DecorateProcedureServer<TRouter, TRouter['_def']['record'][TKey]>
    : never;
};
