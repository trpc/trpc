// Stream parsing adapted from https://www.loginradius.com/blog/engineering/guest-post/http-streaming-with-nodejs-and-fetch-api/

import { TRPCResponse } from '@trpc/server/rpc';
import { TRPCClientError } from '../../TRPCClientError';
import {
  HTTPBaseRequestOptions,
  HTTPResult,
  fetchHTTPResponse,
  getBody,
  getUrl,
} from '../internals/httpUtils';
import { HTTPHeaders } from '../types';

/**
 * @param readableStream as given by `(await fetch(url)).body`
 * @param parser defaults to `JSON.parse`
 * @param onFull called when the first line is not `{`, so we had to give up on parsing as a newline-delimited stream
 * @param onSingle called for each line of the stream
 * @param onDone called when the stream is exhausted (only after `onSingle`, if `onFull` was called `onDone` will not be called)
 */
export function parseJsonStream<TReturn>(
  readableStream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  onFull: (res: TReturn) => void,
  onSingle: (index: number, res: TReturn) => void,
  onDone: () => void,
  parser: (text: string) => TReturn = JSON.parse,
  signal?: AbortSignal,
) {
  let isFirstLine = true;
  let isFullSink = false;
  let fullAccumulator = '';
  const onLine = (line: string) => {
    if (signal?.aborted) return;
    if (isFirstLine) {
      isFirstLine = false;
      if (line !== '{') {
        isFullSink = true;
        fullAccumulator = line;
      }
      return;
    }
    if (isFullSink) {
      fullAccumulator += line;
      return;
    }

    const string = line[0] === ',' ? line.substring(1, line.length) : line;
    if (!string) return;
    if (string === '}') return;

    // parsing index out of start of line "0":{...}
    // lines after the first one start with a comma ,"1":{...}
    const start = 2; // start after first digit to save iterations
    const end = 6; // assumes index will never be longer than 4 digits
    let i = start;
    while (i < end) {
      if (string[i] === '"') break;
      i++;
    }
    if (i === end)
      throw new TRPCClientError(
        'Invalid JSON string response format: a multiline JSON string was received but it does not conform to the expected format for streamed responses. Do you have intermediaries between the server and the client that might be reformatting the response?',
      );
    const index = string.substring(1, i);
    const text = string.substring(i + 2);
    onSingle(index as unknown as number, parser(text));
  };

  const onLinesDone = () => {
    if (isFullSink) {
      onFull(parser(fullAccumulator));
    } else {
      onDone();
    }
  };

  readLines(readableStream, onLine, onLinesDone);
}

const textDecoder = new TextDecoder();

function readLines(
  readableStream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  onLine: (line: string) => void,
  onDone: () => void,
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

  const onChunksDone = () => {
    onLine(partOfLine);
    onDone();
  };

  if ('getReader' in readableStream) {
    void readStandardChunks(readableStream.getReader(), onChunk, onChunksDone);
  } else {
    readNodeChunks(readableStream, onChunk, onChunksDone);
  }
}

function readNodeChunks(
  reader: NodeJS.ReadableStream,
  onChunk: (chunk: Uint8Array) => void,
  onDone: () => void,
) {
  reader.on('data', onChunk);
  reader.on('end', onDone);
}

async function readStandardChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (chunk: Uint8Array) => void,
  onDone: () => void,
) {
  let readResult = await reader.read();
  while (!readResult.done) {
    onChunk(readResult.value);
    readResult = await reader.read();
  }
  onDone();
}

export const streamingJsonHttpRequester = (
  opts: HTTPBaseRequestOptions & {
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  },
  onFull: (res: HTTPResult) => void,
  onSingle: (index: number, res: HTTPResult) => void,
  onDone: () => void,
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
  void responsePromise.then(async (res) => {
    if (!res.body) throw new Error('Received response without body');
    const meta: HTTPResult['meta'] = { response: res };
    return parseJsonStream(
      res.body,
      onFull,
      onSingle,
      onDone,
      (string) => ({
        json: JSON.parse(string) as TRPCResponse,
        meta,
      }),
      ac?.signal,
    );
  });

  return cancel;
};
