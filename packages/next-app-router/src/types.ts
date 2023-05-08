import type { Resolver, TRPCClientError } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
  ProcedureRouterRecord,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { type SWRResponse } from 'swr';

export type QueryResolver<TProcedure extends AnyProcedure> = (
  input: inferProcedureInput<TProcedure>,
  opts?: {
    revalidate?: number | false;
  },
) => Promise<inferProcedureOutput<TProcedure>>;

export type SWRResolver<TProcedure extends AnyProcedure> = (
  input: inferProcedureInput<TProcedure>,
  opts?: {
    revalidate?: number | false;
  },
) => SWRResponse<inferProcedureOutput<TProcedure>, TRPCClientError<TProcedure>>;

export type DecorateProcedureServer<TProcedure extends AnyProcedure> =
  TProcedure extends AnyQueryProcedure
    ? {
        query: QueryResolver<TProcedure>;
        revalidate: () => void;
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

export type DecorateProcedureClient<TProcedure extends AnyProcedure> =
  TProcedure extends AnyQueryProcedure
    ? {
        useQuery: SWRResolver<TProcedure>;
        revalidate: () => void;
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

export type ServerDecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? ServerDecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedureServer<TProcedures[TKey]>
    : never;
};

export type ClientDecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? ClientDecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedureClient<TProcedures[TKey]>
    : never;
};
