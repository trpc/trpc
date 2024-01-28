import type { Resolver } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnySubscriptionProcedure,
  inferProcedureInput,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';

export type DecorateProcedureServer<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> = TProcedure extends AnyQueryProcedure
  ? {
      query: Resolver<TRoot, TProcedure>;
      revalidate: (
        input?: inferProcedureInput<TProcedure>,
      ) => Promise<
        { revalidated: false; error: string } | { revalidated: true }
      >;
    }
  : TProcedure extends AnyMutationProcedure
  ? {
      mutate: Resolver<TRoot, TProcedure>;
    }
  : TProcedure extends AnySubscriptionProcedure
  ? {
      subscribe: Resolver<TRoot, TProcedure>;
    }
  : never;

export type NextAppDirDecoratedProcedureRecord<
  TRoot extends AnyRootTypes,
  TProcedures extends RouterRecord,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends infer TItem
    ? TItem extends RouterRecord
      ? NextAppDirDecoratedProcedureRecord<TRoot, TItem>
      : TItem extends AnyProcedure
      ? DecorateProcedureServer<TRoot, TItem>
      : never
    : never;
};
