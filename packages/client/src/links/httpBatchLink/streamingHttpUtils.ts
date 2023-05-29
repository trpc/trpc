// Stream parsing adapted from https://www.loginradius.com/blog/engineering/guest-post/http-streaming-with-nodejs-and-fetch-api/

import { TRPCResponse } from '@trpc/server/rpc';
import {
  HTTPBaseRequestOptions,
  HTTPResult,
  fetchHTTPResponse,
  getBody,
  getUrl,
} from '../internals/httpUtils';
import { HTTPHeaders } from '../types';

export async function parseJsonStream<TReturn>(opts: {
  /**
   * As given by `(await fetch(url)).body`
   */
  readableStream: ReadableStream<Uint8Array> | NodeJS.ReadableStream;
  /**
   * Called for each line of the stream
   */
  onSingle: (index: number, res: TReturn) => void;
  /**
   * Called when the stream is finished
   */
  parse?: (text: string) => TReturn;
  signal?: AbortSignal;
}): Promise<TReturn | undefined> {
  const parse = opts.parse ?? JSON.parse;

  let isFirstLine = true;
  let isFullSink = false;
  let fullAccumulator = '';
  const onLine = (line: string) => {
    if (opts.signal?.aborted) return;
    if (isFirstLine) {
      isFirstLine = false;
      if (line !== '{') {
        // unexpected format, don't try to parse it as a stream
        isFullSink = true;
        fullAccumulator = line;
      }
      return;
    }
    if (isFullSink) {
      fullAccumulator += line;
      return;
    }

    if (!line || line === '}') {
      return;
    }

    // removing comma from start of line
    const string = line[0] === ',' ? line.substring(1, line.length) : line;

    // parsing index out of start of line "0":{...}
    const indexOfColon = string.indexOf(':');

    const indexAsStr = string.substring(1, indexOfColon - 1);

    const text = string.substring(indexAsStr.length + 3);

    opts.onSingle(Number(indexAsStr), parse(text));
  };

  await readLines(opts.readableStream, onLine);

  if (isFullSink) {
    return parse(fullAccumulator);
  } else {
    return undefined;
  }
}

const textDecoder = new TextDecoder();

async function readLines(
  readableStream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  onLine: (line: string) => void,
) {
  let partOfLine = '';

  const onChunk = (chunk: Uint8Array) => {
    const chunkText = textDecoder.decode(chunk);
    const chunkLines = chunkText.split('\n');
    if (chunkLines.length === 1) {
      partOfLine += chunkLines[0];
    } else if (chunkLines.length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
      onLine(partOfLine + chunkLines[0]!);
      for (let i = 1; i < chunkLines.length - 1; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
        onLine(chunkLines[i]!);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length doesn't change
      partOfLine = chunkLines[chunkLines.length - 1]!;
    }
  };

  if ('getReader' in readableStream) {
    await readStandardChunks(readableStream.getReader(), onChunk);
  } else {
    await readNodeChunks(readableStream, onChunk);
  }

  onLine(partOfLine);
}

function readNodeChunks(
  reader: NodeJS.ReadableStream,
  onChunk: (chunk: Uint8Array) => void,
) {
  return new Promise<void>((resolve) => {
    reader.on('data', onChunk);
    reader.on('end', resolve);
  });
}

async function readStandardChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (chunk: Uint8Array) => void,
) {
  let readResult = await reader.read();
  while (!readResult.done) {
    onChunk(readResult.value);
    readResult = await reader.read();
  }
}

export const streamingJsonHttpRequester = (
  opts: HTTPBaseRequestOptions & {
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
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
    return parseJsonStream({
      readableStream: res.body,
      onSingle,
      parse: (string) => ({
        json: JSON.parse(string) as TRPCResponse,
        meta,
      }),
      signal: ac?.signal,
    });
  });

  return { cancel, promise };
};
