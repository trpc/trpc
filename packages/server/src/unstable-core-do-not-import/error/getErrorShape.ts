import { getHTTPStatusCodeFromError } from '../http/getHTTPStatusCode';
import type { ProcedureType } from '../procedure';
import type { AnyRootTypes, RootConfig } from '../rootConfig';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import type { DefaultErrorShape } from './formatter';
import { isTRPCDeclaredError } from './TRPCDeclaredError';
import type { TRPCError } from './TRPCError';
import {
  procedureErrorKeySymbol,
  TRPCProcedureError,
} from './TRPCProcedureError';

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
  if (isTRPCDeclaredError(opts.error)) {
    return opts.error.toShape();
  }

  const cause = opts.error.cause;
  if (
    cause instanceof TRPCProcedureError &&
    typeof cause[procedureErrorKeySymbol] === 'string'
  ) {
    return cause.shape;
  }

  return getFormattedErrorShape(opts, opts.error);
}

function getFormattedErrorShape<TRoot extends AnyRootTypes>(
  opts: {
    config: RootConfig<TRoot>;
    type: ProcedureType | 'unknown';
    path: string | undefined;
    input: unknown;
    ctx: TRoot['ctx'] | undefined;
  },
  error: TRPCError,
): TRoot['errorShape'] {
  const { config, path } = opts;
  const { code } = error;
  const shape: DefaultErrorShape = {
    message: error.message,
    code: TRPC_ERROR_CODES_BY_KEY[code],
    '~': {
      kind: 'formatted',
    },
    data: {
      code,
      httpStatus: getHTTPStatusCodeFromError(error),
    },
  };
  if (config.isDev && typeof error.stack === 'string') {
    shape.data.stack = error.stack;
  }
  if (typeof path === 'string') {
    shape.data.path = path;
  }
  return config.errorFormatter({
    ctx: opts.ctx,
    error,
    input: opts.input,
    path,
    shape,
    type: opts.type,
  });
}
