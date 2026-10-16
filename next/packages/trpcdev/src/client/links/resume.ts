/**
 * How `experimental_durableLink` asks `httpLink` to resume a streamed
 * output mid-stream: a call option under a symbol, so it stays out of the
 * typed call options.
 *
 * @internal
 */
import type { AnyTrpcError } from '../../internal/error.ts';

/** @internal */
export const RESUME: unique symbol = Symbol.for('trpcdev/resume');

/** @internal */
export interface Resume {
  readonly retries: number;
  readonly delayMs: (attempt: number, error: AnyTrpcError) => number;
  readonly lost: (error: AnyTrpcError) => boolean;
}

/** @internal */
export const resumeOf = (context: object): Resume | undefined =>
  (context as { [RESUME]?: Resume })[RESUME];

/** @internal */
export const withResume = <T extends object>(context: T, resume: Resume): T =>
  Object.assign({ ...context }, { [RESUME]: resume });
