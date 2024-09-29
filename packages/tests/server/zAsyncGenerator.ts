import type { TrackedEnvelope } from '@trpc/server';
import { isTrackedEnvelope, tracked } from '@trpc/server';
import { z } from 'zod';

function isAsyncIterable<TValue, TReturn = unknown>(
  value: unknown,
): value is AsyncIterable<TValue, TReturn> {
  return !!value && typeof value === 'object' && Symbol.asyncIterator in value;
}
const trackedEnvelopeSchema =
  z.custom<TrackedEnvelope<unknown>>(isTrackedEnvelope);

/**
 * A Zod schema helper designed specifically for validating async generators. This schema ensures that:
 * 1. The value being validated is an async iterable.
 * 2. Each item yielded by the async iterable conforms to a specified type.
 * 3. The return value of the async iterable, if any, also conforms to a specified type.
 */
export function zAsyncGenerator<
  TYieldIn,
  TYieldOut,
  TReturnIn = void,
  TReturnOut = void,
  Tracked extends boolean = false,
>(opts: {
  /**
   * Validate the value yielded by the async generator
   */
  yield: z.ZodType<TYieldIn, any, TYieldOut>;
  /**
   * Validate the return value of the async generator
   * @remark not applicable for subscriptions
   */
  return?: z.ZodType<TReturnIn, any, TReturnOut>;
  /**
   * Whether if the yielded values are tracked
   * @remark only applicable for subscriptions
   */
  tracked?: Tracked;
}) {
  return z
    .custom<
      AsyncGenerator<
        Tracked extends true ? TrackedEnvelope<TYieldIn> : TYieldIn,
        TReturnIn
      >
    >((val) => isAsyncIterable(val))
    .transform(async function* (iter) {
      const iterator = iter[Symbol.asyncIterator]();
      let next;
      while ((next = await iterator.next()) && !next.done) {
        if (opts.tracked) {
          const [id, data] = trackedEnvelopeSchema.parse(next.value);
          yield tracked(id, await opts.yield.parseAsync(data));
          continue;
        }
        yield opts.yield.parseAsync(next.value);
      }
      if (opts.return) {
        return await opts.return.parseAsync(next.value);
      }
      return;
    }) as z.ZodType<
    AsyncGenerator<
      Tracked extends true ? TrackedEnvelope<TYieldIn> : TYieldIn,
      TReturnIn,
      unknown
    >,
    any,
    AsyncGenerator<
      Tracked extends true ? TrackedEnvelope<TYieldOut> : TYieldOut,
      TReturnOut,
      unknown
    >
  >;
}
