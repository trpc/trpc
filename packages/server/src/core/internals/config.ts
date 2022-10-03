import { ErrorFormatter } from '../../error/formatter';
import { DataTransformerOptions } from '../../transformer';

/**
 * The initial generics that are used in the init function
 * @internal
 */
export interface InitGenerics {
  ctx: Record<string, unknown>;
  meta: Record<string, unknown>;
  // FIXME this should be typed
  errorShape: any;
}

/**
 * The default check to see if we're in a server
 */
export const isServerDefault: boolean =
  typeof window === 'undefined' ||
  'Deno' in window ||
  process.env.NODE_ENV === 'test' ||
  !!process.env.JEST_WORKER_ID;

/**
 * The runtime config that are used and actually represents real values underneath
 * @internal
 */
export interface RuntimeConfig<TType extends InitGenerics> {
  transformer: DataTransformerOptions;
  errorFormatter: ErrorFormatter<TType['ctx'], any>;
  /**
   * Allow `@trpc/server` to run in non-server environments
   * @default false
   */
  allowOutsideOfServer: boolean;
  /**
   * Is this a server environment?
   */
  isServer: boolean;
  /**
   * Is this development?
   * Will be used to decide if API should return stack traces
   * @default process.env.NODE_ENV !== 'production'
   */
  isDev: boolean;
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
export interface RootConfig<TGenerics extends InitGenerics>
  extends RuntimeConfig<TGenerics> {
  _def: TGenerics;
}

/**
 * @internal
 */
export type AnyRootConfig = RootConfig<any>;
