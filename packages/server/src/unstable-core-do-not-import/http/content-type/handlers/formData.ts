import { TRPCError } from '../../../../@trpc/server';
import type { ContentTypeHandler } from '../../../../@trpc/server/http';

export const formDataContentTypeHandler: ContentTypeHandler = {
  async getInputs(req) {
    if (req.method !== 'POST') {
      throw new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message:
          'Only POST requests are supported for multipart/form-data requests',
      });
    }
    const fd = await req.formData();

    return fd;
  },
  isMatch(req) {
    return !!req.headers.get('content-type')?.startsWith('multipart/form-data');
  },
  batching: false,
  transform: false,
};
