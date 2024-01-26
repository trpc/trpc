import type { AnyRootTypes } from './rootConfig';
import type { AnyRouter } from './router';

export type TRPCInferrable = AnyRouter | AnyRootTypes;
export type inferConfigTypes<TInferrable extends TRPCInferrable> =
  TInferrable extends AnyRootTypes
    ? TInferrable
    : TInferrable extends AnyRouter
    ? TInferrable['_def']['_config']['$types']
    : never;

export type inferErrorShape<TInferrable extends TRPCInferrable> =
  inferConfigTypes<TInferrable>['errorShape'];
