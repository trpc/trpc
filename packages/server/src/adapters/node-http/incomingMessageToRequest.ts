import type * as http from 'http';
import { TRPCError } from '../../@trpc/server';

export interface IncomingMessageWithBody extends http.IncomingMessage {
  /**
   * Many adapters will add a `body` property to the incoming message and pre-parse the body
   */
  body?: unknown;
}
/**
 * Convert an incoming message to a body stream with a max size
 */
function incomingMessageToBodyStream(
  req: IncomingMessageWithBody,
  opts: { maxBodySize: number | null },
) {
  type Value = Buffer | Uint8Array | string | null;
  let size = 0;
  const maxBodySize = opts.maxBodySize;
  let hasClosed = false;

  const stream = new ReadableStream<Value>({
    start(controller) {
      req.on('data', (chunk) => {
        size += chunk.length;
        if (maxBodySize != null && size > maxBodySize) {
          controller.error(
            new TRPCError({
              code: 'PAYLOAD_TOO_LARGE',
            }),
          );
          // an error is thrown if we try to close the controller after
          // erroring, so track the closure
          hasClosed = true;
          return;
        }
        controller.enqueue(chunk);
      });
      req.once('end', () => {
        if (hasClosed) {
          return;
        }
        hasClosed = true;
        controller.close();
      });
    },
    cancel() {
      req.destroy();
    },
  });

  return stream;
}

const bodyMethods = ['POST', 'PUT', 'PATCH'];
/**
 * Convert an [`IncomingMessage`](https://nodejs.org/api/http.html#class-httpincomingmessage) to a [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)
 */
export function incomingMessageToRequest(
  req: http.IncomingMessage,
  opts: {
    /**
     * Max body size in bytes. If the body is larger than this, the request will be aborted
     */
    maxBodySize: number | null;
  },
): Request {
  const ac = new AbortController();
  const headers = new Headers(req.headers as any);
  const url = `http://${headers.get('host')}${req.url}`;
  req.once('aborted', () => {
    ac.abort();
  });

  const init: RequestInit = {
    headers,
    method: req.method,
    signal: ac.signal,
    // @ts-expect-error this is fine
    duplex: 'half',
  };

  if (req.method && bodyMethods.includes(req.method)) {
    if (!('body' in req)) {
      init.body = incomingMessageToBodyStream(req, opts);
    } else if (typeof req.body === 'string') {
      init.body = req.body;
    } else if (req.body !== undefined) {
      init.body = JSON.stringify(req.body);
    }
  }
  const request = new Request(url, init);

  return request;
}
