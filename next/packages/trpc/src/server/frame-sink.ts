/**
 * How `experimental_durable()` hands a streamed output's frames to the HTTP
 * handler. The handler registers a sink for an unbatched call; other
 * transports don't, so streamed outputs aren't kept there.
 *
 * @internal
 */
import type { Stream } from 'effect';
import type { Chunk, Frame } from '../serializer/stream.ts';
import type { ResponseHandle } from './procedures/index.ts';

/** @internal */
export interface FrameSink {
  /** Kept frames to send instead of the call's value, which is `undefined`. */
  replay?: Stream.Stream<Frame> | undefined;
  /** Keeps the serialized output and returns the frames to send. */
  keep?:
    | ((
        head: Frame,
        chunks: Stream.Stream<Chunk, unknown>,
      ) => Stream.Stream<Frame>)
    | undefined;
}

/** @internal */
export const frameSinks: WeakMap<ResponseHandle, FrameSink> = new WeakMap();
