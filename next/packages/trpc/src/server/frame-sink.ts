/**
 * How `experimental_durable()` hands a streamed output's frames to the HTTP
 * handler. The handler provides a sink to an unbatched call; other
 * transports don't, so streamed outputs aren't kept there.
 *
 * @internal
 */
import { Context, type Stream } from 'effect';
import type { Chunk, Frame } from '../serializer/stream.ts';

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

/** The call's sink, when its transport keeps frames. @internal */
export const CurrentFrameSink: Context.Reference<FrameSink | undefined> =
  Context.Reference<FrameSink | undefined>('@trpc12/trpc/FrameSink', {
    defaultValue: () => undefined,
  });
