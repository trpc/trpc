import { Stream } from 'stream';
import type { NodeHTTPContentTypeHandler } from '../../internals/contentType';
import type { NodeHTTPRequest, NodeHTTPResponse } from '../../types';

export const getOctetContentTypeHandler: () => NodeHTTPContentTypeHandler<
  NodeHTTPRequest,
  NodeHTTPResponse
> = () => ({
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
