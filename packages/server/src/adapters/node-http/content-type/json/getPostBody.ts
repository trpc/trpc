// @trpc/server
import { TRPCError } from '../../../../@trpc/server';
import type { BodyResult } from '../../../../@trpc/server/http';
import type { NodeHTTPRequest } from '../../types';

export async function getPostBody(opts: {
  req: NodeHTTPRequest;
  maxBodySize?: number;
}): Promise<BodyResult> {
  const { req, maxBodySize = Infinity } = opts;
  return new Promise((resolve) => {
    if (
      !req.headers['content-type']?.startsWith('application/json') &&
      (!req.method ||
        (req.method !== 'GET' &&
          req.method !== 'OPTIONS' &&
          req.method !== 'HEAD'))
    ) {
      resolve({
        ok: false,
        error: new TRPCError({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Invalid Content-Type header (expected application/json)',
        }),
      });
      return;
    }
    if ('body' in req) {
      resolve({
        ok: true,
        data: req.body,
        // If the request headers specifies a content-type, we assume that the body has been preprocessed
        preprocessed:
          !!req.headers['content-type']?.startsWith('application/json'),
      });
      return;
    }
    let body = '';
    let hasBody = false;
    req.on('data', function (data) {
      body += data;
      hasBody = true;
      if (body.length > maxBodySize) {
        resolve({
          ok: false,
          error: new TRPCError({ code: 'PAYLOAD_TOO_LARGE' }),
        });
      }
    });
    req.on('end', () => {
      resolve({
        ok: true,
        data: hasBody ? body : undefined,
        preprocessed: false,
      });
    });
  });
}
