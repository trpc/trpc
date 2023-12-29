import { getJsonContentTypeInputs } from '@trpc/core/http';
import { createNodeHTTPContentTypeHandler } from '../../internals/contentType';
import { getPostBody } from './getPostBody';

export const nodeHTTPJSONContentTypeHandler = createNodeHTTPContentTypeHandler({
  isMatch(opts) {
    return !!opts.req.headers['content-type']?.startsWith('application/json');
  },
  getBody: getPostBody,
  getInputs: getJsonContentTypeInputs,
});
