import { getHTTPStatusCodeFromError } from '../http/getHTTPStatusCode.ts';
import type { ProcedureType } from '../procedure.ts';
import type { AnyRootTypes, RootConfig } from '../rootConfig.ts';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc/index.ts';
import type { DefaultErrorShape } from './formatter.ts';
import type { TRPCError } from './TRPCError.ts';

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
}): TRoot['errorShape'] {
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
