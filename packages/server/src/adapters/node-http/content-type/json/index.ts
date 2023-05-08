import { getJsonContentTypeInputs } from '../../../../http/contentType';
import { createNodeHTTPContentTypeHandler } from '../../internals/contentType';

export const nodeHTTPJSONContentTypeHandler = createNodeHTTPContentTypeHandler({
  isMatch(opts) {
    return opts.req.headers['content-type'] === 'application/json';
  },
  getInputs: getJsonContentTypeInputs,
});
