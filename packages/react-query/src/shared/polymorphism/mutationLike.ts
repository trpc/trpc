import type {
  AnyProcedure,
  AnyRootConfigTypes,
  inferProcedureInput,
  inferTransformedProcedureOutput,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  InferMutationOptions,
  InferMutationResult,
} from '../../utils/inferReactQueryProcedure';

/**
 * Use to describe a mutation route which matches a given mutation procedure's interface
 */
export type MutationLike<
  TConfig extends AnyRootConfigTypes,
  TProcedure extends AnyProcedure,
> = {
  useMutation: (
    opts?: InferMutationOptions<TConfig, TProcedure>,
  ) => InferMutationResult<TConfig, TProcedure>;
};

/**
 * Use to unwrap a MutationLike's input
 */
export type InferMutationLikeInput<
  TMutationLike extends MutationLike<any, any>,
> = TMutationLike extends MutationLike<any, infer $Procedure>
  ? inferProcedureInput<$Procedure>
  : never;

/**
 * Use to unwrap a MutationLike's data output
 */
export type InferMutationLikeData<
  TMutationLike extends MutationLike<any, any>,
> = TMutationLike extends MutationLike<infer TConfig, infer TProcedure>
  ? inferTransformedProcedureOutput<TConfig, TProcedure>
  : never;
