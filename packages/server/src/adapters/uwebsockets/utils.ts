import type { HttpResponse } from 'uWebSockets.js';

import type {
  WrappedHTTPRequest,
  // uHTTPRequestHandlerOptions,
  // WrappedHTTPResponse,
} from './types';
import { TRPCError } from '../../error/TRPCError';

export const getPostBody = <
  // TRouter extends AnyRouter,
  TRequest extends WrappedHTTPRequest
// TResponse extends WrappedHTTPResponse
>(
  method: TRequest['method'],
  res: HttpResponse,
  maxBodySize?: number
) =>
  new Promise<{ ok: false; error: TRPCError } | { ok: true; data: unknown }>(
    (resolve) => {
      if (method === 'GET') {
        // no body in get request
        resolve({
          ok: true,
          data: undefined,
        });
      }

      let buffer: Buffer;

      res.onData((ab, isLast) => {
        //resolve right away if there is only one chunk
        if (buffer === undefined && isLast) {
          resolve({
            ok: true,
            data: Buffer.from(ab).toString(),
          });
          return;
        }

        const chunk = Buffer.from(ab);

        if (maxBodySize && buffer.length >= maxBodySize) {
          resolve({
            ok: false,
            error: new TRPCError({ code: 'PAYLOAD_TOO_LARGE' }),
          });
        }
        if (buffer) {
          //else accumulate
          buffer = Buffer.concat([buffer, chunk]);
        } else {
          buffer = Buffer.concat([chunk]);
        }

        if (isLast) {
          resolve({
            ok: true,
            data: buffer.toString(),
          });
        }
      });

      res.onAborted(() => {
        resolve({
          ok: false,
          error: new TRPCError({ code: 'CLIENT_CLOSED_REQUEST' }),
        });
      });
    }
  );

// FIXME buffer the output with tryEnd instead
// https://github.com/uNetworking/uWebSockets.js/blob/master/examples/VideoStreamer.js
export const sendResponse = (res: HttpResponse, payload?: string) => {
  res.end(payload);
};
