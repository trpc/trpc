import { getHTTPStatusCodeFromError } from '../http/getHTTPStatusCode';
import type { ProcedureType } from '../procedure';
import type { AnyRootTypes, RootConfig } from '../rootConfig';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import type { DefaultErrorShape } from './formatter';
import type { AnyTRPCDeclaredErrorClass } from './TRPCDeclaredError';
import {
  isRegisteredTRPCDeclaredError,
  isTRPCDeclaredError,
} from './TRPCDeclaredError';
import { TRPCError } from './TRPCError';
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
  declaredErrors?: readonly AnyTRPCDeclaredErrorClass[];
}): TRoot['errorShape'] {
  if (isTRPCDeclaredError(opts.error)) {
    if (isRegisteredTRPCDeclaredError(opts.error, opts.declaredErrors)) {
      // Registered declared errors will bypass the formatter because they have their own shape already
      return opts.error.toShape();
    }

    const pathSuffix = opts?.path ? ` in procedure "${opts.path}"` : '';

    // eslint-disable-next-line no-console
    console.warn(
      `Unregistered declared error was thrown${pathSuffix}. Treating it as INTERNAL_SERVER_ERROR and passing it through the error formatter.`,
      opts.error,
    );

    return getFormattedErrorShape(
      opts,
      new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unrecognized error occured',
        cause: opts.error,
      }),
    );
  }

  const cause = opts.error.cause;
  if (
    cause instanceof TRPCProcedureError &&
    typeof cause[procedureErrorKeySymbol] === 'string'
  ) {
    return cause.shape as TRoot['errorShape'];
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
