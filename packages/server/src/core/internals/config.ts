import { ErrorFormatter } from '../../error/formatter';
import {
  CombinedDataTransformer,
  DataTransformerOptions,
} from '../../transformer';

/**
 * The initial generics that are used in the init function
 * @internal
 */
export interface InitGenerics {
  ctx: Record<string, unknown>;
  meta: Record<string, unknown>;
}
/**
 * The initial params that are used and actually represents real values underneath
 * @internal
 */
export interface InitOptions<T extends InitGenerics> {
  transformer: DataTransformerOptions;
  errorFormatter: ErrorFormatter<T['ctx'], any>;
}

/**
 * @internal
 */
export type CreateInitGenerics<T extends InitGenerics> = T;

/**
 * The config that is resolved after `initTRPC.create()` has been called
 * Combination of `InitTOptions` + `InitGenerics`
 * @internal
 */
export interface RootConfig extends InitGenerics {
  transformer: CombinedDataTransformer;
  // FIXME this should probably be restricted
  errorShape: any;
}

/**
 * @internal
 */
export type CreateRootConfig<T extends RootConfig> = T;
