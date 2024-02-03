import type { Resolver } from '@trpc/client';
import type {
  AnyClientTypes,
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnySubscriptionProcedure,
  inferProcedureInput,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';

export type DecorateProcedureServer<
  TProcedure extends AnyProcedure,
  TRoot extends AnyClientTypes,
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

export type NextAppDirDecorateRouterRecord<
  TRoot extends AnyClientTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? NextAppDirDecorateRouterRecord<TRoot, $Value>
      : $Value extends AnyProcedure
      ? DecorateProcedureServer<$Value, TRoot>
      : never
    : never;
};
