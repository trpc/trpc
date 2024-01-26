import type { AnyRootConfig, AnyRootConfigTypes } from './rootConfig';
import type { AnyRouter } from './router';

export type TRPCInferrable = AnyRouter | AnyRootConfig | AnyRootConfigTypes;
export type inferConfigTypes<TInferrable extends TRPCInferrable> =
  TInferrable extends AnyRootConfigTypes
    ? TInferrable
    : TInferrable extends AnyRouter
    ? TInferrable['_def']['_config']['$types']
    : TInferrable extends AnyRootConfig
    ? TInferrable['$types']
    : never;

export type inferErrorShape<TInferrable extends TRPCInferrable> =
  inferConfigTypes<TInferrable>['errorShape'];
