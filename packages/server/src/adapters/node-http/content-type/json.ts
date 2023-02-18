/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { TRPCError } from '../../../error/TRPCError';
import { getJsonContentTypeInputs } from '../../../http/contentType';
import { createNodeHTTPContentTypeHandler } from '../internals/contentType';

export const nodeHTTPJSONContentTypeHandler = createNodeHTTPContentTypeHandler({
  isMatch(opts) {
    return opts.req.headers['content-type'] === 'application/json';
  },
  getBody: async (opts) => {
    const { req, maxBodySize = Infinity } = opts;
    return new Promise((resolve) => {
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
  },
  getInputs: getJsonContentTypeInputs,
});
