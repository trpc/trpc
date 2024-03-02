import { getJsonContentTypeInputs } from '../../../../@trpc/server/http.ts';
import { createNodeHTTPContentTypeHandler } from '../../internals/contentType.ts';
import { getPostBody } from './getPostBody.ts';

export const nodeHTTPJSONContentTypeHandler = createNodeHTTPContentTypeHandler({
  isMatch(opts) {
    return !!opts.req.headers['content-type']?.startsWith('application/json');
  },
  getBody: getPostBody,
  getInputs: getJsonContentTypeInputs,
});
