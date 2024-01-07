import type { AnyRootConfig } from '../rootConfig';
import type { AnyRouter } from '../router';

export type TRPCInferrable = AnyRouter | AnyRootConfig;
export type inferConfig<TInferrable extends TRPCInferrable> =
  TInferrable extends AnyRouter ? TInferrable['_def']['_config'] : TInferrable;

export type inferErrorShape<TInferrable extends TRPCInferrable> =
  inferConfig<TInferrable>['$types']['errorShape'];
