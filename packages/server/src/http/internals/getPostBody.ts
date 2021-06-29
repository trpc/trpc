import { TRPCError } from '../../TRPCError';
import { BaseRequest } from '../../internals/BaseHandlerOptions';

export async function getPostBody({
  req,
  maxBodySize,
}: {
  req: BaseRequest;
  maxBodySize?: number;
}) {
  return new Promise<any>((resolve, reject) => {
    if (req.hasOwnProperty('body')) {
      resolve(req.body);
      return;
    }
    let body = '';
    req.on('data', function (data) {
      body += data;
      if (typeof maxBodySize === 'number' && body.length > maxBodySize) {
        reject(new TRPCError({ code: 'PAYLOAD_TOO_LARGE' }));
        req.socket.destroy();
      }
    });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        resolve(json);
      } catch (err) {
        reject(new TRPCError({ code: 'PARSE_ERROR' }));
      }
    });
  });
}
