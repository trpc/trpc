import { Effect, Stream } from 'effect';

/** A socket message as one line of JSON. @internal */
export const encodeLine = (message: unknown): string =>
  `${JSON.stringify(message)}\n`;

/** The non-empty lines in a socket's bytes, one message each. @internal */
export const decodeLines = <E>(
  bytes: Stream.Stream<Uint8Array, E>,
): Stream.Stream<string, E> =>
  bytes.pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.filter((line) => line.length > 0),
  );

/**
 * `bytes`, failing once a line runs past `maxBytes` without a `\n`, before
 * the rest of it is read. @internal
 */
export const limitLineLength = <E>(
  bytes: Stream.Stream<Uint8Array, E>,
  maxBytes: number,
): Stream.Stream<Uint8Array, E | Error> =>
  Stream.suspend(() => {
    let pending = 0;
    const tooLong = Effect.fail(
      new Error(`A line is longer than ${maxBytes} bytes`),
    );
    return Stream.mapEffect(bytes, (chunk) => {
      let start = 0;
      for (
        let end = chunk.indexOf(10);
        end !== -1;
        end = chunk.indexOf(10, start)
      ) {
        if (pending + end - start > maxBytes) return tooLong;
        pending = 0;
        start = end + 1;
      }
      pending += chunk.byteLength - start;
      return pending > maxBytes ? tooLong : Effect.succeed(chunk);
    });
  });
