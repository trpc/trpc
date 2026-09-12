import { getHTTPStatusCodeFromError } from '../http/getHTTPStatusCode';
import type { AnyProcedure, ProcedureType } from '../procedure';
import type { AnyRootTypes, RootConfig } from '../rootConfig';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import type { DefaultErrorShape } from './formatter';
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
  const errorFormatters = opts.procedure?._def.errorFormatters ?? [];
  for (let i = errorFormatters.length - 1; i >= 0; i--) {
    const formatted = errorFormatters[i]?.({ ...opts, shape });
    if (formatted !== undefined) {
      return formatted;
    }
  }

  return config.errorFormatter({ ...opts, shape });
}
