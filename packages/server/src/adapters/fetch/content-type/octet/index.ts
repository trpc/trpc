// @trpc/server
import type { AnyRouter } from '../../../../@trpc/server';
import type { FetchContentTypeHandler } from '../../types';

export const getOctetContentTypeHandler: <
  TRouter extends AnyRouter,
  TRequest extends Request,
>() => FetchContentTypeHandler<TRouter, TRequest> = () => ({
  name: 'node-http-octet',
  isMatch(opts) {
    return (
      opts.req.headers
        .get('content-type')
        ?.startsWith('application/octet-stream') ?? false
    );
  },
  async getInputs(opts, inputOpts) {
    if (inputOpts.isBatchCall) {
      throw new Error('Batch calls not supported for octet-stream');
    }

    const stream = opts.req.body;
    return stream;
  },
});
