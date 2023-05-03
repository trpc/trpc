/**
 * Copyright 2021 Remix Software Inc.
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * @see https://github.com/remix-run/remix/blob/0bcb4a304dd2f08f6032c3bf0c3aa7eb5b976901/packages/remix-server-runtime/formData.ts
 */
import { CombinedDataTransformer } from '@trpc/server/transformer';
import { streamMultipart } from '@web3-storage/multipart-parser';
import { Readable } from 'node:stream';
import { createNodeHTTPContentTypeHandler } from '../../internals/contentType';
import { NodeHTTPRequest } from '../../types';
import { UploadHandler, UploadHandlerPart } from './uploadHandler';

/**
 * Allows you to handle multipart forms (file uploads) for your app.
 *
 * TODO: Update this comment
 * @see https://remix.run/utils/parse-multipart-form-data
 */
async function parseMultipartFormData(
  request: NodeHTTPRequest,
  uploadHandler: UploadHandler,
): Promise<FormData> {
  const contentType = request.headers['content-type'] || '';
  const [type, boundary] = contentType.split(/\s*;\s*boundary=/);

  if (!boundary || type !== 'multipart/form-data') {
    throw new TypeError('Could not parse content as FormData.');
  }

  const formData = new FormData();
  const parts: AsyncIterable<UploadHandlerPart & { done?: true }> =
    streamMultipart(Readable.toWeb(request), boundary);

  for await (const part of parts) {
    if (part.done) break;

    if (typeof part.filename === 'string') {
      // only pass basename as the multipart/form-data spec recommends
      // https://datatracker.ietf.org/doc/html/rfc7578#section-4.2
      part.filename = part.filename.split(/[/\\]/).pop();
    }

    const value = await uploadHandler(part);

    if (typeof value !== 'undefined' && value !== null) {
      formData.append(part.name, value as any);
    }
  }

  return formData;
}

function isMultipartFormDataRequest(req: NodeHTTPRequest) {
  const contentTypeHeader = req.headers['content-type'];
  return (
    contentTypeHeader?.startsWith('multipart/form-data') ||
    contentTypeHeader === 'application/x-www-form-urlencoded'
  );
}

export const nodeHTTPFormDataContentTypeHandler =
  createNodeHTTPContentTypeHandler({
    isMatch(opts) {
      return isMultipartFormDataRequest(opts.req);
    },
    async getBody(opts) {
      const fields = Object.fromEntries(opts.query);

      return {
        ok: true,
        data: fields,
        preprocessed: false,
      };
    },
    getInputs(opts) {
      const req = opts.req;
      const unparsedInput = req.query.get('input');
      if (!unparsedInput) {
        return {
          0: undefined,
        };
      }
      const transformer = opts.router._def._config
        .transformer as CombinedDataTransformer;

      const deserializedInput = transformer.input.deserialize(
        JSON.parse(unparsedInput),
      );
      return {
        0: deserializedInput,
      };
    },
  });

export { parseMultipartFormData as experimental_parseMultipartFormData };
export { createMemoryUploadHandler as experimental_createMemoryUploadHandler } from './memoryUploadHandler';
export { createFileUploadHandler as experimental_createFileUploadHandler } from './fileUploadHandler';
export { composeUploadHandlers as experimental_composeUploadHandlers } from './uploadHandler';
export { type UploadHandler } from './uploadHandler';
export { isMultipartFormDataRequest as experimental_isMultipartFormDataRequest };
