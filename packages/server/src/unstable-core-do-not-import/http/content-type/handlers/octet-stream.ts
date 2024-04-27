import type { ContentTypeHandler } from '../../../../@trpc/server/http';

export const octetStreamContentTypeHandler: ContentTypeHandler = {
  async getInputs(req) {
    return req.body;
  },
  isMatch(req) {
    return !!req.headers
      .get('content-type')
      ?.startsWith('application/octet-stream');
  },
  batching: false,
  transform: false,
};
