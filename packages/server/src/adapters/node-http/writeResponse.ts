// eslint-disable-next-line no-restricted-imports
import { isAbortError } from '../../unstable-core-do-not-import';
import type { NodeHTTPResponse } from './types';

async function writeResponseBodyChunk(
  res: NodeHTTPResponse,
  chunk: Uint8Array,
) {
  // useful for debugging 🙃
  // console.debug('writing', new TextDecoder().decode(chunk));

  if (res.write(chunk) === false) {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: unknown) => {
        reject(err);
        cleanup();
      };
      const onDrain = () => {
        resolve();
        cleanup();
      };
      const cleanup = () => {
        res.off('error', onError);
        res.off('drain', onDrain);
      };
      res.once('error', onError);
      res.once('drain', onDrain);
    });
  }
}
/**
 * @internal
 */

export async function writeResponseBody(opts: {
  res: NodeHTTPResponse;
  signal: AbortSignal;
  body: NonNullable<Response['body']>;
}) {
  const { res } = opts;

  try {
    const writableStream = new WritableStream({
      async write(chunk) {
        await writeResponseBodyChunk(res, chunk);
        res.flush?.();
      },
    });

    await opts.body.pipeTo(writableStream, {
      signal: opts.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      return;
    }
    throw err;
  }
}
/**
 * @internal
 */

export async function writeResponse(opts: {
  request: Request;
  response: Response;
  rawResponse: NodeHTTPResponse;
}) {
  const { response, rawResponse } = opts;

  // Only override status code if it hasn't been explicitly set in a procedure etc
  if (rawResponse.statusCode === 200) {
    rawResponse.statusCode = response.status;
  }
  for (const [key, value] of response.headers) {
    rawResponse.setHeader(key, value);
  }
  try {
    if (response.body) {
      await writeResponseBody({
        res: rawResponse,
        signal: opts.request.signal,
        body: response.body,
      });
    }
  } catch (err) {
    if (!rawResponse.headersSent) {
      rawResponse.statusCode = 500;
    }
    throw err;
  } finally {
    rawResponse.end();
  }
}
