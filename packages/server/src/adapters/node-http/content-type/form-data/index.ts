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
  isMatch(opts) {
    return (
      opts.req.headers['content-type']?.startsWith('multipart/form-data') ??
      false
    );
  },
  async getInputs(opts, inputOpts) {
    if (inputOpts.isBatchCall) {
      throw new Error('Batch calls not supported for form-data');
    }

    const form = await new Request('https://unused.com', {
      method: 'POST',
      headers: opts.req.headers as HeadersInit,
      body: Readable.toWeb(opts.req) as any,
      // @ts-expect-error - outdated types?
      duplex: 'half',
    }).formData();

    return form;
  },
});
