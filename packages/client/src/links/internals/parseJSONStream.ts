// Stream parsing adapted from https://www.loginradius.com/blog/engineering/guest-post/http-streaming-with-nodejs-and-fetch-api/
import { TRPCResponse } from '@trpc/server/rpc';
import { WebReadableStreamEsque } from '../../internals/types';
import { HTTPHeaders } from '../types';
import {
  fetchHTTPResponse,
  getBody,
  getUrl,
  HTTPBaseRequestOptions,
  HTTPResult,
} from './httpUtils';
import { TextDecoderEsque } from './streamingUtils';

/**
 * @internal
 * @description Take a stream of bytes and call `onLine` with
 * a JSON object for each line in the stream. Expected stream
 * format is:
 * ```json
 * {"1": {...}
 * ,"0": {...}
 * }
 * ```
 */
export async function parseJSONStream<TReturn>(opts: {
  /**
   * As given by `(await fetch(url)).body`
   */
  readableStream: NodeJS.ReadableStream | WebReadableStreamEsque;
  /**
   * Called for each line of the stream
   */
  onSingle: (index: number, res: TReturn) => void;
  /**
   * Transform text into useable data object (defaults to JSON.parse)
   */
  parse?: (text: string) => TReturn;
  signal?: AbortSignal;
  textDecoder: TextDecoderEsque;
}): Promise<void> {
  const parse = opts.parse ?? JSON.parse;

  const onLine = (line: string) => {
    if (opts.signal?.aborted) return;
    if (!line || line === '}') {
      return;
    }
    /**
     * At this point, `line` can be one of two things:
     * - The first line of the stream `{"2":{...}`
     * - A line in the middle of the stream `,"2":{...}`
     */
    const indexOfColon = line.indexOf(':');
    const indexAsStr = line.substring(2, indexOfColon - 1);
    const text = line.substring(indexOfColon + 1);

    opts.onSingle(Number(indexAsStr), parse(text));
  };

  await readLines(opts.readableStream, onLine, opts.textDecoder);
}

/**
 * Handle transforming a stream of bytes into lines of text.
 * To avoid using AsyncIterators / AsyncGenerators,
 * we use a callback for each line.
 *
 * @param readableStream can be a NodeJS stream or a WebAPI stream
 * @param onLine will be called for every line ('\n' delimited) in the stream
 */
async function readLines(
  readableStream: NodeJS.ReadableStream | WebReadableStreamEsque,
  onLine: (line: string) => void,
  textDecoder: TextDecoderEsque,
) {
  let partOfLine = '';

  const onChunk = (chunk: Uint8Array) => {
    const chunkText = textDecoder.decode(chunk);
    const chunkLines = chunkText.split('\n');
    if (chunkLines.length === 1) {
      partOfLine += chunkLines[0];
    } else if (chunkLines.length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked on line above
      onLine(partOfLine + chunkLines[0]!);
      for (let i = 1; i < chunkLines.length - 1; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked on line above
        onLine(chunkLines[i]!);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length doesn't change, so is necessarily > 1
      partOfLine = chunkLines[chunkLines.length - 1]!;
    }
  };

  // we handle 2 different types of streams, this if where we figure out which one we have
  if ('getReader' in readableStream) {
    await readStandardChunks(readableStream, onChunk);
  } else {
    await readNodeChunks(readableStream, onChunk);
  }

  onLine(partOfLine);
}

/**
 * Handle NodeJS stream
 */
function readNodeChunks(
  stream: NodeJS.ReadableStream,
  onChunk: (chunk: Uint8Array) => void,
) {
  return new Promise<void>((resolve) => {
    stream.on('data', onChunk);
    stream.on('end', resolve);
  });
}

/**
 * Handle WebAPI stream
 */
async function readStandardChunks(
  stream: WebReadableStreamEsque,
  onChunk: (chunk: Uint8Array) => void,
) {
  const reader = stream.getReader();
  let readResult = await reader.read();
  while (!readResult.done) {
    onChunk(readResult.value);
    readResult = await reader.read();
  }
}

export const streamingJsonHttpRequester = (
  opts: HTTPBaseRequestOptions & {
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
    textDecoder: TextDecoderEsque;
  },
  onSingle: (index: number, res: HTTPResult) => void,
) => {
  const ac = opts.AbortController ? new opts.AbortController() : null;
  const responsePromise = fetchHTTPResponse(
    {
      ...opts,
      contentTypeHeader: 'application/json',
      batchModeHeader: 'stream',
      getUrl,
      getBody,
    },
    ac,
  );
  const cancel = () => ac?.abort();
  const promise = responsePromise.then(async (res) => {
    if (!res.body) throw new Error('Received response without body');
    const meta: HTTPResult['meta'] = { response: res };
    return parseJSONStream<HTTPResult>({
      readableStream: res.body,
      onSingle,
      parse: (string) => ({
        json: JSON.parse(string) as TRPCResponse,
        meta,
      }),
      signal: ac?.signal,
      textDecoder: opts.textDecoder,
    });
  });

  return { cancel, promise };
};
