import type { ProcedureType } from '../procedure';
import type { AnyRootTypes, RootConfig } from '../rootConfig';
import { getDefaultErrorShape, getFormattedErrorShape } from './formatter';
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
}): TRoot['errorShape'] {
  const { path, error, config } = opts;

  // a `.errors()` handler already claimed this one
  const formatted = getFormattedErrorShape(error);
  if (formatted !== undefined) {
    return formatted;
  }

  const shape = getDefaultErrorShape({ error, path, isDev: config.isDev });
  return config.errorFormatter({ ...opts, shape });
}
