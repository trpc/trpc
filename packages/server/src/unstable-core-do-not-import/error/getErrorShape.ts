import type { ProcedureType } from '../procedure';
import type { AnyRootTypes, RootConfig } from '../rootConfig';
import type { FormattedErrorShapes } from './formatter';
import { getDefaultErrorShape } from './formatter';
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
  /**
   * The `errorShapes` passed to the procedure call that threw `error`
   */
  errorShapes?: FormattedErrorShapes;
}): TRoot['errorShape'] {
  const { errorShapes, ...formatterOpts } = opts;
  const { path, error, config } = formatterOpts;

  // a `.errors()` handler already created the final shape
  const formatted = errorShapes?.get(error);
  if (formatted !== undefined) {
    return formatted;
  }

  const shape = getDefaultErrorShape({ error, path, isDev: config.isDev });
  return config.errorFormatter({ ...formatterOpts, shape });
}
