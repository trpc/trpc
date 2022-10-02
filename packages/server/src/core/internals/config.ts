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
 * The default check to see if we're in a server
 */
export const isServerDefault: boolean =
  typeof window !== 'undefined' ||
  !('Deno' in window) ||
  process.env.NODE_ENV !== 'test' ||
  process.env.JEST_WORKER_ID === undefined;

/**
 * The initial params that are used and actually represents real values underneath
 * @internal
 */
export interface InitOptions<TType extends InitGenerics> {
  transformer: DataTransformerOptions;
  errorFormatter: ErrorFormatter<TType['ctx'], any>;
  /**
   * Allow `@trpc/server` to run in non-server environments
   * @default false
   */
  allowOutsideOfServer: boolean;
  /**
   * Is this a server environment?
   * @default typeof window !== 'undefined'
   */
  isServer: boolean;
}

/**
 * @internal
 */
export type CreateInitGenerics<TType extends InitGenerics> = TType;

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
export type CreateRootConfig<TConfig extends RootConfig> = TConfig;
