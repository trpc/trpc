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
    console.log('hello json', req.headers.get('content-type'));
    return req.headers.get('content-type') == 'application/json';
  },
  batching: true,
  transform: true,
};
