import { Effect, Stream } from 'effect';
import {
  fromWireError,
  streamErrors,
  type AnyTrpcError,
} from '../../../internal/error.ts';
import { decodeRecords } from '../../../internal/frames.ts';
import { CONTENT_TYPE, HEADER } from '../../../internal/protocol.ts';
import type { Frame } from '../../../serializer/index.ts';
import type { Operation } from '../../link.ts';
import { badResponse } from '../events.ts';
import { resumeOf, retrying, type Retries } from '../resume.ts';
import {
  abortOnInterrupt,
  ok,
  readLines,
  streamed,
  toHttpError,
  type Reply,
  type Transport,
} from './transport.ts';

/**
 * Options for {@link experimental_httpStreams}.
 * @since 0.1.0
 * @stability experimental
 */
export interface HttpStreamsOptions {
  /**
   * Ask for streamed outputs and batches as binary frames instead of JSONL,
   * so `File` and `Blob` bytes in them arrive unencoded rather than as
   * base64 (a third smaller). Servers that don't know frames answer with
   * JSONL.
   * @default false
   */
  binary?: boolean;
}

/**
 * What {@link experimental_httpStreams} gives `httpLink`'s `streams` option.
 * @since 0.1.0
 * @stability experimental
 */
export interface HttpStreams {
  /** @internal */
  readonly '~trpc': {
    /** The streamed types requests accept, preferred first. */
    readonly accept: string;
    /** A frames body's lines; `undefined` without `binary`. */
    readonly frames:
      | ((
          bytes: Stream.Stream<Uint8Array, AnyTrpcError>,
        ) => Stream.Stream<unknown, AnyTrpcError>)
      | undefined;
    /** A single call's streamed output. */
    readonly read: (
      transport: Transport,
      reply: Reply,
      op: Operation,
    ) => Effect.Effect<unknown, AnyTrpcError>;
  };
}

const reviveError = (value: unknown) => fromWireError(value);

/**
 * Lets `httpLink` ask for and read streamed outputs: a query or mutation
 * whose output is, or holds, a promise, an async iterable or a `Stream`
 * answers with JSONL (or binary frames). A dropped stream resumes when
 * `experimental_durableLink` asks for it. Without this, `httpLink` asks for
 * JSON only, and a call whose output streams fails with
 * `UNSUPPORTED_PROTOCOL`, so a client that never streams doesn't bundle the
 * decoders.
 *
 * @example
 * ```ts
 * httpLink({ url, streams: experimental_httpStreams() });
 * httpLink({ url, streams: experimental_httpStreams({ binary: true }) });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_httpStreams(
  opts: HttpStreamsOptions = {},
): HttpStreams {
  const accept = opts.binary
    ? `${CONTENT_TYPE.frames}, ${CONTENT_TYPE.jsonl}`
    : CONTENT_TYPE.jsonl;
  const frames = opts.binary ? decodeRecords : undefined;
  const linesOf = (reply: Reply) =>
    readLines(reply, frames) as Stream.Stream<Frame, AnyTrpcError>;

  /**
   * `first`, then, when the connection drops, the rest from a retry that
   * says how many arrived (`trpc-resume-from`), fed to the same deserializer.
   */
  const resumable = (
    transport: Transport,
    op: Operation,
    resume: Retries,
    first: Stream.Stream<Frame, AnyTrpcError>,
  ): Stream.Stream<Frame, AnyTrpcError> => {
    let count = 0;
    const reopen = abortOnInterrupt(
      Effect.gen(function* () {
        const reply = yield* transport.call(
          op,
          `${CONTENT_TYPE.json}, ${accept}`,
          { [HEADER.resumeFrom]: String(count) },
        );
        yield* transport.reported(op, reply);
        if (!ok(reply)) return yield* transport.readError(reply);
        if (!streamed(reply)) {
          return yield* Effect.fail(
            badResponse('A resumed call answered without frames')(),
          );
        }
        return linesOf(reply);
      }),
    );
    return retrying(resume, (n) =>
      Stream.tap(n === 0 ? first : Stream.unwrap(reopen), () =>
        Effect.sync(() => count++),
      ),
    );
  };

  return {
    '~trpc': {
      accept,
      frames,
      read: (transport, reply, op) => {
        const first = linesOf(reply);
        const resume = resumeOf(op.context);
        return transport.serializer
          .deserializeStream(
            resume ? resumable(transport, op, resume, first) : first,
            { reviveError, ...streamErrors },
          )
          .pipe(
            Effect.mapError(toHttpError),
            Effect.catchDefect((defect) => Effect.fail(toHttpError(defect))),
          );
      },
    },
  };
}
