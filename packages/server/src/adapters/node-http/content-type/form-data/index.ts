import { Readable } from 'stream';
// @trpc/server
import type { AnyRouter } from '../../../../@trpc/server';
import type { NodeHTTPRequest, NodeHTTPResponse } from '../../types';
import type { NodeHTTPContentTypeHandler } from '../types';

export const getFormDataContentTypeHandler: <
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>() => NodeHTTPContentTypeHandler<TRouter, TRequest, TResponse> = () => ({
  name: 'node-http-formdata',
  isMatch: (contentType) => contentType.startsWith('multipart/form-data'),
  async getInputs(opts, inputOpts) {
    if (inputOpts.isBatchCall) {
      throw new Error('Batch calls not supported for form-data');
    }

    const contentType = opts.req.headers['content-type'];
    if (!contentType) {
      // Should be unreachable given the isMatch check
      throw new Error('No content-type header found');
    }

    const form = await new Request('https://unused.com', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: Readable.toWeb(opts.req) as ReadableStream,
      // @ts-expect-error - outdated types? this exists
      duplex: 'half',
    }).formData();

    return form;
  },
});
