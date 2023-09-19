import { TRPCError } from '../../../../error/TRPCError';
import { BodyResult } from '../../../../http/contentType';
import { NodeHTTPRequest } from '../../types';

export async function getPostBody(opts: {
  req: NodeHTTPRequest;
  maxBodySize?: number;
}): Promise<BodyResult> {
  const { req, maxBodySize = Infinity } = opts;
  return new Promise((resolve) => {
    if ('body' in req) {
      resolve({
        ok: true,
        data: req.body,
        // If the request headers specifies a content-type, we assume that the body has been preprocessed
        preprocessed: req.headers['content-type'] === 'application/json',
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
        req.socket.destroy();
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
