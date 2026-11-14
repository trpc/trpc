import { getTRPCErrorFromUnknown, type TRPCError } from '../error/TRPCError';
import type { MaybePromise, Result } from '../types';

/** What a step produced, or the error it failed with */
export type Outcome<TValue> = Result<TValue, TRPCError>;

export function ok<TValue>(value: TValue): Outcome<TValue> {
  return { ok: true, value };
}

export function fail(error: TRPCError): Outcome<never> {
  return { ok: false, error };
}

/** Runs `fn`, turning anything it throws into a failed outcome */
export async function settle<TValue>(
  fn: () => MaybePromise<Outcome<TValue>>,
): Promise<Outcome<TValue>> {
  try {
    return await fn();
  } catch (cause) {
    return fail(getTRPCErrorFromUnknown(cause));
  }
}

/** Runs `fn` straight away, wrapping what it returns or throws */
export function attempt<TValue>(
  fn: () => MaybePromise<TValue>,
): Promise<Outcome<TValue>> {
  return settle(async () => ok(await fn()));
}
