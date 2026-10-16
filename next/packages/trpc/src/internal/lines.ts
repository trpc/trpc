import { Stream } from 'effect';

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
