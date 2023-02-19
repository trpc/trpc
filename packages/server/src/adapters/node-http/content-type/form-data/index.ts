import busboy, { BusboyHeaders } from '@fastify/busboy';
import { createNodeHTTPContentTypeHandler } from '../../internals/contentType';

export const nodeHTTPFormDataContentTypeHandler =
  createNodeHTTPContentTypeHandler({
    isMatch(opts) {
      const contentTypeHeader = opts.req.headers['content-type'];

      console.log('contentTypeHeader', contentTypeHeader);
      return (
        contentTypeHeader?.startsWith('multipart/form-data') ||
        contentTypeHeader === 'application/x-www-form-urlencoded'
      );
    },
    async getBody(opts) {
      const { req } = opts;

      if (req.method === 'GET') {
        const form = new FormData();

        opts.query.forEach((value, key) => {
          form.append(key, value);
        });

        return { ok: true, data: form };
      }

      console.log(req);

      const bb = busboy({ headers: req.headers as BusboyHeaders });
      const form = new FormData();

      await new Promise((resolve, reject) => {
        bb.on('file', async (name, file, filename, _, mimeType) => {
          const chunks: any[] = [];
          await new Promise((resolve, reject) => {
            file.on('data', (chunk) => {
              chunks.push(chunk);
            });
            file.on('error', reject);
            file.on('end', resolve);
          });

          const buffer = Buffer.concat(chunks);

          form.append(
            name,
            new File([buffer], filename, { type: mimeType }) as Blob,
          );
        });

        bb.on('field', (name, value) => {
          form.append(name, value);
        });

        bb.on('error', reject);
        bb.on('finish', resolve);

        req.pipe(bb);
      });

      console.log(form, form.get('name'), form.get('age'));
      return { ok: true, data: form };
    },
    getInputs({ req }) {
      return {
        0: req.body,
      };
    },
  });
