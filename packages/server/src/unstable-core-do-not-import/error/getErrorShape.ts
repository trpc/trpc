import { getStatusCodeFromKey } from '../http/getHTTPStatusCode';
import type { ProcedureType } from '../procedure';
import type { AnyRootTypes, RootConfig } from '../rootConfig';
import type { TRPC_ERROR_CODE_KEY, TRPCErrorShape } from '../rpc';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import { getDefaultErrorShape, getFormattedErrorShape } from './formatter';
import { getTRPCErrorFromUnknown, type TRPCError } from './TRPCError';

/**
 * The shape of an error as the client gets it: from a procedure's
 * `.errors()` formatter if one ran, or else from the root error formatter.
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

  // a `.errors()` handler already created the final shape
  const formatted = getFormattedErrorShape(error);
  if (formatted !== undefined) {
    return formatted;
  }

  const shape = getDefaultErrorShape({ error, path, isDev: config.isDev });
  return config.errorFormatter({ ...opts, shape });
}

/**
 * The shape an error gets when its own can't be built or sent, such as when
 * `errorFormatter` throws. It says nothing beyond the error's code, which the
 * HTTP status reveals anyway, and keeps that code so that a client still
 * knows whether to retry.
 * @internal
 */
export function getFallbackErrorShape(
  cause: unknown,
): TRPCErrorShape<{ code: TRPC_ERROR_CODE_KEY; httpStatus: number }> {
  const { code } = getTRPCErrorFromUnknown(cause);
  return {
    code: TRPC_ERROR_CODES_BY_KEY[code],
    message: code,
    data: { code, httpStatus: getStatusCodeFromKey(code) },
  };
}
