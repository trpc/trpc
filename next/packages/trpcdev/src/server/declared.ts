import { TrpcError, type AnyTrpcError } from '../internal/error.ts';
import type { ErrorMap } from './procedure.ts';

const declaredErrors = new WeakSet<AnyTrpcError>();

/** Whether an error came from a declared error's constructor. @internal */
export const isDeclaredError = (err: AnyTrpcError): boolean =>
  declaredErrors.has(err);

const constructorsCache = new WeakMap<ErrorMap, Record<string, unknown>>();

/** The `errors` object a resolver receives. @internal */
export function errorConstructors(map: ErrorMap): Record<string, unknown> {
  let cached = constructorsCache.get(map);
  if (cached) return cached;
  cached = {};
  for (const [code, spec] of Object.entries(map)) {
    cached[code] = (
      opts: { data?: unknown; message?: string; cause?: unknown } = {},
    ) => {
      const err = new TrpcError({
        code,
        status: spec.status,
        message: opts.message ?? spec.message,
        data: opts.data,
        cause: opts.cause,
        defined: true,
      });
      declaredErrors.add(err);
      return err;
    };
  }
  constructorsCache.set(map, cached);
  return cached;
}
