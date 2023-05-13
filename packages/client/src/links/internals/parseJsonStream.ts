// Adapted from https://www.loginradius.com/blog/engineering/guest-post/http-streaming-with-nodejs-and-fetch-api/

/**
 * @param readableStream as given by `(await fetch(url)).body`
 * @param parser defaults to `JSON.parse`
 *
 * @example
 * ```ts
 * const batch = [ ... ] // the array of items you sent to the server
 * const responseReader = parseJsonStream(response.body)
 * // treating the first result separately in case response was not streamed and we parsed the whole thing
 * const firstRes = responseReader.next()
 * if (firstRes.done) {
 *   const matches = batch.map((item,i) => [item, firstRes.value[i]])
 *   return
 * }
 * // otherwise, we have have a stream, so finish dealing with the first response and let the rest yield
 * const firstMatch = [batch[firstRes.value[0]], firstRes.value[1]]
 * for await (const [index, data] of responseReader) {
 *   const match = [batch[index], data] // out-of-order streaming, so we need `index`
 * }
 * ```
 */
export async function* parseJsonStream<TReturn>(
  readableStream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  parser: (text: string) => TReturn = JSON.parse,
  signal?: AbortSignal,
) {
  const reader =
    'getReader' in readableStream
      ? readStandardChunks(readableStream.getReader()) // case for browser, undici, and native node (since version ???)
      : readNodeChunks(readableStream); // case for node-fetch

  const lineIterator = readLines(reader);
  const firstLine = await lineIterator.next();

  if (firstLine.done) return; // this line is just for typescript, we know for a fact that `readLines` yields at least once

  // if format isn't correct immediately, exhaust the stream and parse it all
  if (firstLine.value !== '{') {
    const text = await allLinesSink(firstLine.value, lineIterator);
    return parser(text);
  }

  for await (const line of lineIterator) {
    if (signal?.aborted) break;
    const string = line[0] === ',' ? line.substring(1, line.length) : line;

    if (!string) continue;
    if (string === '}') break;

    // parsing index out of start of line "0":{...}
    // lines after the first one start with a comma ,"1":{...}
    const start = 2;
    const end = 6;
    let i = start; // start after first digit to save iterations
    while (i < end) {
      // assumes index will never be longer than 4 digits
      if (string[i] === '"') break;
      i++;
    }
    if (i === end) throw new Error('Invalid JSON');

    const index = string.substring(1, i);
    const text = string.substring(i + 2);
    const result: [index: string, data: TReturn] = [index, parser(text)];
    yield result;
    if (signal?.aborted) break;
  }
  return;
}

async function allLinesSink(
  init: string,
  iterator: AsyncGenerator<string, void>,
) {
  while (true) {
    const line = await iterator.next();
    if (line.done) return init;
    init += '\n' + line.value;
  }
}

const textDecoder = new TextDecoder();

async function* readLines(reader: {
  [Symbol.asyncIterator](): AsyncGenerator<Uint8Array, void, unknown>;
}) {
  let partOfLine = '';
  let chunk: IteratorResult<Uint8Array, void>;
  const iterator = reader[Symbol.asyncIterator]();
  while (!(chunk = await iterator.next()).done) {
    const chunkText = textDecoder.decode(chunk.value);
    const chunkLines = chunkText.split('\n');
    if (chunkLines.length === 1) {
      partOfLine += chunkLines[0];
    } else if (chunkLines.length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
      yield partOfLine + chunkLines[0]!;
      for (let i = 1; i < chunkLines.length - 1; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
        yield chunkLines[i]!;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length doesn't change
      partOfLine = chunkLines[chunkLines.length - 1]!;
    }
  }
  yield partOfLine;
}

async function* readNodeChunks(reader: NodeJS.ReadableStream) {
  for await (const chunk of reader) {
    yield chunk as Uint8Array;
  }
}

function readStandardChunks(reader: ReadableStreamDefaultReader<Uint8Array>) {
  return {
    async *[Symbol.asyncIterator]() {
      let readResult = await reader.read();
      while (!readResult.done) {
        yield readResult.value;
        readResult = await reader.read();
      }
    },
  };
}
