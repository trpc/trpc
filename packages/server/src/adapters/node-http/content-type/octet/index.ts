import { Stream } from 'stream';
// @trpc/server
import type { AnyRouter } from '../../../../@trpc/server';
import type { NodeHTTPRequest, NodeHTTPResponse } from '../../types';
import type { NodeHTTPContentTypeHandler } from '../types';

export const getOctetContentTypeHandler: <
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>() => NodeHTTPContentTypeHandler<TRouter, TRequest, TResponse> = () => ({
  name: 'node-http-octet',
  isMatch: (contentType) => contentType.startsWith('application/octet-stream'),
  async getInputs(opts, inputOpts) {
    if (inputOpts.isBatchCall) {
      throw new Error('Batch calls not supported for octet-stream');
    }

    const stream = Stream.Readable.toWeb(opts.req);

    return stream;
  },
});
