import busboy, { BusboyFileStream, BusboyHeaders } from '@fastify/busboy';
import { createNodeHTTPContentTypeHandler } from '../../internals/contentType';

export interface FormDataFileStream {
  /**
   * The stream of the file
   */
  stream: BusboyFileStream;
  /**
   * The name of the file
   */
  name: string;
  /**
   * The mime type of the file
   */
  type: string;
}

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

      const fields: Record<string, string | FormDataFileStream> = {};

      await new Promise((resolve, reject) => {
        bb.on('file', async (inputName, stream, fileName, _, type) => {
          if (fileName) {
            // Assumes files without filenames are not files
            // This avoids the case where you have an input without a file selected in the browser
            fields[inputName] = {
              stream,
              name: fileName,
              type,
            };
          }
          stream.emit('end');
        });

        bb.on('field', (name, value) => {
          fields[name] = value;
        });

        bb.on('error', reject);
        bb.on('finish', resolve);

        req.pipe(bb);
      });

      console.log({ fields });

      return { ok: true, data: fields };
    },
    getInputs({ req }) {
      return {
        0: req.body,
      };
    },
  });
