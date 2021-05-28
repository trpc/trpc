import { HTTPError } from '../errors';
import { BaseRequest } from '../requestHandler';

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
        reject(
          new HTTPError('Payload Too Large', {
            statusCode: 413,
            code: 'BAD_USER_INPUT',
          }),
        );
        req.socket.destroy();
      }
    });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        resolve(json);
      } catch (err) {
        reject(
          new HTTPError("Body couldn't be parsed as json", {
            statusCode: 400,
            code: 'BAD_USER_INPUT',
          }),
        );
      }
    });
  });
}
