import type { AnyProcedure, inferProcedureInput } from '@trpc/server';
import type { inferTransformedProcedureOutput } from '@trpc/server/shared';
import type {
  InferMutationOptions,
  InferMutationResult,
} from '../../utils/inferReactQueryProcedure';

/**
 * Use to describe a mutation route which matches a given mutation procedure's interface
 */
export type MutationLike<TProcedure extends AnyProcedure = AnyProcedure> = {
  useMutation: (
    opts?: InferMutationOptions<TProcedure>,
  ) => InferMutationResult<TProcedure>;
};

/**
 * Use to unwrap a MutationLike's input
 */
export type InferMutationLikeInput<TMutationLike extends MutationLike> =
  TMutationLike extends MutationLike<infer TProcedure>
    ? inferProcedureInput<TProcedure>
    : never;

/**
 * Use to unwrap a MutationLike's data output
 */
export type InferMutationLikeData<TMutationLike extends MutationLike> =
  TMutationLike extends MutationLike<infer TProcedure>
    ? inferTransformedProcedureOutput<TProcedure>
    : never;
