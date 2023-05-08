import { createNodeHttpContentDecoder } from '../../internals/contentDecoder';

export const createNodeHttpJsonContentDecoder = () =>
  createNodeHttpContentDecoder({
    isMatch(opts) {
      return opts.headers['content-type'] === 'application/json';
    },
    async decodeInput(opts) {
      // TODO: merge in getPostBody and getJsonContentTypeInputs since they both are needed for this step
      // await getPostBody({ req: opts.req.req, maxBodySize: opts.req.maxBodySize });
      // await getJsonContentTypeInputs({ req: opts });
      opts;
      throw new Error('Not Implemented nodeHttpJsonContentDecoder');
    },
  });
