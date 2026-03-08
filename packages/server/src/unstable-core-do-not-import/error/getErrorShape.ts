import { getHTTPStatusCodeFromError } from '../http/getHTTPStatusCode';
import type { AnyProcedure } from '../procedure';
import type { ProcedureType } from '../procedure';
import type { AnyRootTypes, RootConfig } from '../rootConfig';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import type { DefaultErrorShape } from './formatter';
import {
  getProcedureErrorShape,
  procedureErrorKeySymbol,
  TRPCProcedureError,
} from './TRPCProcedureError';
import type { TRPCError } from './TRPCError';

/**
 * @internal
 */
export function getErrorShape<TRoot extends AnyRootTypes>(opts: {
  config: RootConfig<TRoot>;
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: TRoot['ctx'] | undefined;
  procedure?: AnyProcedure | null;
}): TRoot['errorShape'] {
  const cause = opts.error.cause;
  if (opts.procedure && cause instanceof TRPCProcedureError) {
    const isDeclaredClassTypedError = opts.procedure._def.errors.some(
      (ErrorClass) => cause instanceof ErrorClass,
    );
    const errorKey = cause[procedureErrorKeySymbol];
    const isDeclaredFactoryTypedError =
      typeof errorKey === 'string' && errorKey in opts.procedure._def.errorFactories;

    if (isDeclaredClassTypedError || isDeclaredFactoryTypedError) {
      return cause.shape as TRoot['errorShape'];
    }
  }

  const typedShape = getProcedureErrorShape(opts.error) as
    | TRoot['errorShape']
    | undefined;
  if (typedShape) {
    return typedShape;
  }

  const { path, error, config } = opts;
  const { code } = opts.error;
  const shape: DefaultErrorShape = {
    message: error.message,
    code: TRPC_ERROR_CODES_BY_KEY[code],
    data: {
      code,
      httpStatus: getHTTPStatusCodeFromError(error),
    },
  };
  if (config.isDev && typeof opts.error.stack === 'string') {
    shape.data.stack = opts.error.stack;
  }
  if (typeof path === 'string') {
    shape.data.path = path;
  }
  return config.errorFormatter({ ...opts, shape });
}
