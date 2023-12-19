/**
 * Copyright 2021 Remix Software Inc.
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * @see https://github.com/remix-run/remix/blob/0bcb4a304dd2f08f6032c3bf0c3aa7eb5b976901/packages/remix-server-runtime/formData.ts
 */
import * as fs from 'fs/promises';
import { Readable } from 'node:stream';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore the type definitions for this package are borked
import { streamMultipart } from '@web3-storage/multipart-parser';
import { CombinedDataTransformer } from '../../../../transformer';
import { createNodeHTTPContentTypeHandler } from '../../internals/contentType';
import { NodeHTTPRequest } from '../../types';
import { NodeOnDiskFile } from './fileUploadHandler';
import {
  MaxBodySizeExceededError,
  UploadHandler,
  UploadHandlerPart,
} from './uploadHandler';

const utfTextDecoder = new TextDecoder('utf-8');

/**
 * Allows you to handle multipart forms (file uploads) for your app.
 * Request body parts with a 'filename' property will be treated as files.
 * The rest will be treated as text.
 * @param request The incoming Node HTTP request
 * @param uploadHandler A function that handles file uploads and returns a value to be used in the request body. If uploaded to disk, the returned value is a NodeOnDiskFile. If uploaded to memory, the returned value is a File.
 * @param maxBodySize The maximum size of the request body in bytes. Defaults to Infinity.
 *
 * @see https://remix.run/utils/parse-multipart-form-data
 */
async function parseMultipartFormData(
  request: NodeHTTPRequest,
  uploadHandler: UploadHandler,
  maxBodySize = Infinity,
) {
  const contentType = request.headers['content-type'] ?? '';
  const [type, boundary] = contentType.split(/\s*;\s*boundary=/);

  if (!boundary || type !== 'multipart/form-data') {
    throw new TypeError('Could not parse content as FormData.');
  }

  const formData = new FormData();
  const parts: AsyncIterable<UploadHandlerPart & { done?: true }> =
    streamMultipart(Readable.toWeb(request), boundary);

  let currentBodySize = 0;

  const nodeOnDiskFiles: NodeOnDiskFile[] = [];

  try {
    for await (const part of parts) {
      if (part.done) break;

      if (typeof part.filename === 'string') {
        // This is a file, so the uploadHandler function will be called

        // only pass basename as the multipart/form-data spec recommends
        // https://datatracker.ietf.org/doc/html/rfc7578#section-4.2
        part.filename = part.filename.split(/[/\\]/).pop();
        const value = await uploadHandler(part as Required<typeof part>);

        if (typeof value === 'undefined' || value === null) {
          continue;
        }
        // add to cleanup array in case of error
        if (value instanceof NodeOnDiskFile) {
          nodeOnDiskFiles.push(value);
        }

        // if the combined size of the body exceeds the max size, throw an error
        currentBodySize += value.size;
        if (currentBodySize > maxBodySize) {
          throw new MaxBodySizeExceededError(maxBodySize);
        }
        // add the file to the form data
        formData.append(part.name, value as any);
      } else {
        // This is text, so we'll decode it and add it to the form data
        let textualPart = '';
        for await (const chunk of part.data) {
          // if the combined size of the body exceeds the max size, throw an error
          currentBodySize += chunk.length;
          if (currentBodySize > maxBodySize) {
            throw new MaxBodySizeExceededError(maxBodySize);
          }
          textualPart += utfTextDecoder.decode(chunk);
        }
        // add the text to the form data
        formData.append(part.name, textualPart);
      }
    }

    return formData;
  } catch (e) {
    // clean up any files that were uploaded to disk if an error occurs
    await Promise.all(
      nodeOnDiskFiles.map((file) => fs.unlink(file.getFilePath())),
    );
    throw e;
  }
}

function isMultipartFormDataRequest(req: NodeHTTPRequest) {
  const contentTypeHeader = req.headers['content-type'];
  return (
    contentTypeHeader?.startsWith('multipart/form-data') ??
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
export {
  createFileUploadHandler as experimental_createFileUploadHandler,
  NodeOnDiskFile as experimental_NodeOnDiskFile,
} from './fileUploadHandler';
export {
  composeUploadHandlers as experimental_composeUploadHandlers,
  MaxPartSizeExceededError,
  MaxBodySizeExceededError,
} from './uploadHandler';
export { type UploadHandler } from './uploadHandler';
export { isMultipartFormDataRequest as experimental_isMultipartFormDataRequest };
