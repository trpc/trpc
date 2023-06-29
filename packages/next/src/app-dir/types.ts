import { Resolver } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
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

type DecorateRouter = {
  /** Fuzzily revalidate all paths starting with this */
  revalidate(): Promise<void>;
};

export type NextAppDirDecoratedProcedureRecord<TRouter extends AnyRouter> =
  DecorateRouter & {
    [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends AnyRouter
      ? DecorateRouter &
          NextAppDirDecoratedProcedureRecord<TRouter['_def']['record'][TKey]>
      : TRouter['_def']['record'][TKey] extends AnyProcedure
      ? DecorateProcedureServer<TRouter['_def']['record'][TKey]>
      : never;
  };
