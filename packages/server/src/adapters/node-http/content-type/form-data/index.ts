import busboy, { BusboyFileStream, BusboyHeaders } from '@fastify/busboy';
import { createNodeHTTPContentTypeHandler } from '../../internals/contentType';

export const nodeHTTPFormDataContentTypeHandler =
  createNodeHTTPContentTypeHandler({
    isMatch(opts) {
      const contentTypeHeader = opts.req.headers['content-type'];

      return (
        contentTypeHeader?.startsWith('multipart/form-data') ||
        contentTypeHeader === 'application/x-www-form-urlencoded'
      );
    },
    async getBody(opts) {
      const { req } = opts;

      if (req.method === 'GET') {
        const fields: Record<string, string> = {};

        opts.query.forEach((value, key) => {
          fields[key] = value;
        });

        return { ok: true, data: fields };
      }

      const bb = busboy({ headers: req.headers as BusboyHeaders });
      // const form = new FormData();

      const fields: Record<
        string,
        string | { file: BusboyFileStream; filename: string; mimeType: string }
      > = {};

      await new Promise((resolve, reject) => {
        bb.on('file', async (name, file, filename, _, mimeType) => {
          file.emit('end');
          new Blob([file], { type: mimeType });
          new File([file], filename, { type: mimeType });
          fields[name] = { file, filename, mimeType };
        });

        bb.on('field', (name, value) => {
          fields[name] = value;
        });

        bb.on('error', reject);
        bb.on('finish', resolve);

        req.pipe(bb);
      });

      return { ok: true, data: fields };
    },
    getInputs({ req }) {
      return {
        0: req.body,
      };
    },
  });
