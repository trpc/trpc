import {
  InferMutationOptions,
  InferMutationResult,
  InferQueryOptions,
  InferQueryResult,
} from '@trpc/react-query/utils/inferReactQueryProcedure';
import { AnyProcedure, inferProcedureInput } from '@trpc/server';

export type MutationLike<TProcedure extends AnyProcedure> = {
  useMutation: (
    opts?: InferMutationOptions<TProcedure>,
  ) => InferMutationResult<TProcedure>;
};

export type QueryLike<TProcedure extends AnyProcedure> = {
  useQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TProcedure, any>,
  ) => InferQueryResult<TProcedure>;
};

// TODO: it would be nice to also support Utils for this
export type UtilsLike = {
  invalidate: never;
};
