import { TRPCError } from '../../../error/TRPCError';
import { NodeHTTPRequest } from '../types';

export async function getPostBody(opts: {
  req: NodeHTTPRequest;
  maxBodySize?: number;
}) {
  const { req, maxBodySize = Infinity } = opts;
  return new Promise<
    { ok: true; data: unknown } | { ok: false; error: TRPCError }
  >((resolve) => {
    if ('body' in req) {
      resolve({ ok: true, data: req.body });
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
      });
    });
  });
}
