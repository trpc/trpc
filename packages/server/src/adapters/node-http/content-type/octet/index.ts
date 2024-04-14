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
  isMatch(opts) {
    return (
      opts.req.headers['content-type']?.startsWith(
        'application/octet-stream',
      ) ?? false
    );
  },
  async getInputs(opts, inputOpts) {
    if (inputOpts.isBatchCall) {
      throw new Error('Batch calls not supported for octet-stream');
    }

    const stream = Stream.Readable.from(opts.req);

    return stream;
  },
});
