import { TrpcError } from '../../internal/error.ts';
import type { ErrorMap } from '../procedures/index.ts';

const constructorsCache = new WeakMap<ErrorMap, Record<string, unknown>>();

/** The `errors` object a resolver receives. @internal */
export function errorConstructors(map: ErrorMap): Record<string, unknown> {
  let cached = constructorsCache.get(map);
  if (cached) return cached;
  cached = {};
  for (const [code, spec] of Object.entries(map)) {
    cached[code] = (
      opts: { data?: unknown; message?: string; cause?: unknown } = {},
    ) =>
      new TrpcError({
        code,
        tag: spec.tag,
        message: opts.message ?? spec.message,
        data: opts.data,
        cause: opts.cause,
        defined: true,
      });
  }
  constructorsCache.set(map, cached);
  return cached;
}
