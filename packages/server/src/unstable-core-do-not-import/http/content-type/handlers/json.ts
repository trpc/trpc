import type { ContentTypeHandler } from '../../../../@trpc/server/http';

export const jsonContentTypeHandler: ContentTypeHandler = {
  async getInputs(req, searchParams) {
    if (req.method === 'GET') {
      const input = searchParams.get('input');
      if (input === null) {
        return undefined;
      }
      return JSON.parse(input);
    }
    return await req.json();
  },
  isMatch(req) {
    return !!req.headers.get('content-type')?.startsWith('multipart/form-data');
  },
  batching: false,
  transform: false,
};
