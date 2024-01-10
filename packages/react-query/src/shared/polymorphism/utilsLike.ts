import type { AnyRouter } from '@trpc/server';
import type { DecoratedProcedureUtilsRecord } from '../proxy/utilsProxy';

/**
 * Use to describe a Utils/Context path which matches the given route's interface
 */
export type UtilsLike<TRouter extends AnyRouter> =
  DecoratedProcedureUtilsRecord<TRouter>;
