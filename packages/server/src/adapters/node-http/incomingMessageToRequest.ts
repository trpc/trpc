import type * as http from 'http';
import { TRPCError } from '../../@trpc/server';
import type { NodeHTTPRequest, NodeHTTPResponse } from './types';

function createBody(
  req: NodeHTTPRequest,
  opts: {
    /**
     * Max body size in bytes. If the body is larger than this, the request will be aborted
     */
    maxBodySize: number | null;
  },
): RequestInit['body'] {
  // Some adapters will pre-parse the body and add it to the request object
  if ('body' in req) {
    if (req.body === undefined) {
      // If body property exists but is undefined, return undefined
      return undefined;
    }
    // If the body is already a string, return it directly
    if (typeof req.body === 'string') {
      return req.body;
    }
    // If body exists but isn't a string, stringify it as JSON
    return JSON.stringify(req.body);
  }
  let size = 0;
  let hasClosed = false;

  return new ReadableStream({
    start(controller) {
      const onData = (chunk: Buffer) => {
        size += chunk.length;
        if (!opts.maxBodySize || size <= opts.maxBodySize) {
          controller.enqueue(
            new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
          );
          return;
        }
        controller.error(
          new TRPCError({
            code: 'PAYLOAD_TOO_LARGE',
          }),
        );
        hasClosed = true;
        req.off('data', onData);
        req.off('end', onEnd);
      };

      const onEnd = () => {
        if (hasClosed) {
          return;
        }
        hasClosed = true;
        req.off('data', onData);
        req.off('end', onEnd);
        controller.close();
      };

      req.on('data', onData);
      req.on('end', onEnd);
    },
    cancel() {
      req.destroy();
    },
  });
}
export function createURL(req: NodeHTTPRequest): URL {
  try {
    const protocol =
      // http2
      (req.headers[':scheme'] && req.headers[':scheme'] === 'https') ||
      // http1
      (req.socket && 'encrypted' in req.socket && req.socket.encrypted)
        ? 'https:'
        : 'http:';

    const host = req.headers.host ?? req.headers[':authority'] ?? 'localhost';

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return new URL(req.url!, `${protocol}//${host}`);
  } catch (cause) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid URL',
      cause,
    });
  }
}

function createHeaders(incoming: http.IncomingHttpHeaders): Headers {
  const headers = new Headers();

  for (const key in incoming) {
    const value = incoming[key];
    if (typeof key === 'string' && key.startsWith(':')) {
      // Skip HTTP/2 pseudo-headers
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value != null) {
      headers.append(key, value);
    }
  }

  return headers;
}

/**
 * Convert an [`IncomingMessage`](https://nodejs.org/api/http.html#class-httpincomingmessage) to a [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)
 */
export function incomingMessageToRequest(
  req: NodeHTTPRequest,
  res: NodeHTTPResponse,
  opts: {
    /**
     * Max body size in bytes. If the body is larger than this, the request will be aborted
     */
    maxBodySize: number | null;
  },
): Request {
  const ac = new AbortController();

  const onAbort = () => {
    res.off('close', onAbort);
    req.off('aborted', onAbort);

    // abort the request
    ac.abort();
  };

  res.once('close', onAbort);
  req.once('aborted', onAbort);

  // Get host from either regular header or HTTP/2 pseudo-header
  const url = createURL(req);

  const init: RequestInit = {
    headers: createHeaders(req.headers),
    method: req.method,
    signal: ac.signal,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = createBody(req, opts);

    // init.duplex = 'half' must be set when body is a ReadableStream, and Node follows the spec.
    // However, this property is not defined in the TypeScript types for RequestInit, so we have
    // to cast it here in order to set it without a type error.
    // See https://fetch.spec.whatwg.org/#dom-requestinit-duplex
    // @ts-expect-error this is fine
    init.duplex = 'half';
  }

  const request = new Request(url, init);

  return request;
}
