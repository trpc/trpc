import { getJsonContentTypeInputs } from '@trpc/server/http/contentType';
import { createNodeHttpContentDecoder } from '../../internals/contentDecoder';

// TODO: not really sure why we needed this
// import { getPostBody } from './getPostBody';

export const createNodeHttpJsonContentDecoder = () =>
  createNodeHttpContentDecoder({
    isMatch(opts) {
      return opts.headers['content-type'] === 'application/json';
    },
    async decodeInput(opts) {
      return await getJsonContentTypeInputs(opts);
    },
  });
