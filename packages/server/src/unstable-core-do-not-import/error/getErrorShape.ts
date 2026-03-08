import { getHTTPStatusCodeFromError } from '../http/getHTTPStatusCode';
import type { ProcedureType } from '../procedure';
import type { AnyProcedure } from '../procedure';
import type { AnyRootTypes, RootConfig } from '../rootConfig';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import type { DefaultErrorShape } from './formatter';
import type { TRPCError } from './TRPCError';
import { TRPCProcedureError } from './TRPCProcedureError';

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
  const { procedure } = opts;
  const cause = opts.error.cause;
  if (procedure && cause instanceof TRPCProcedureError) {
    const isDeclaredTypedError = procedure._def.errors.some(
      (ErrorClass) => cause instanceof ErrorClass,
    );

    if (isDeclaredTypedError) {
      return cause.shape as TRoot['errorShape'];
    }
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
