import busboy, { Busboy, BusboyHeaders } from '@fastify/busboy';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNodeHTTPContentTypeHandler } from '../../internals/contentType';

export interface FormDataFileStream {
  /**
   * The stream of the file
   */
  stream: fs.ReadStream;
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

      await new Promise(async (resolve, reject) => {
        let tmpdir: string;

        bb.on('file', async (inputName, stream, fileName, _, type) => {
          // Assumes files without filenames are not files
          // This avoids the case where you have an input without a file selected in the browser
          if (fileName) {
            if (!tmpdir) {
              const osTmpdir = os.tmpdir();
              tmpdir = await fs.promises.mkdtemp(`${osTmpdir}${path.sep}`);
            }

            const filepath = path.join(tmpdir, fileName);

            const writer = fs.createWriteStream(filepath);
            for await (const chunk of stream) {
              writer.write(chunk);
            }
            console.log('wrote temp file:', filepath);
            fields[inputName] = {
              stream: fs.createReadStream(filepath),
              name: fileName,
              type,
            };
          } else {
            stream.on('data', () => {});
          }
          // stream.on('data', (data) => {
          //   console.log(`File [${fileName}] got ${data.length} bytes`);
          // });
          // stream.on('end', () => {
          //   console.log(`File [${fileName}] Finished`);
          // });
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
