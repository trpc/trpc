import { TRPCError } from '../error/TRPCError';

type ContentTypeHandler = {
  isMatch: (opts: Request) => boolean;
  getInputs: (req: Request, searchParams: URLSearchParams) => Promise<unknown>;
  batching: boolean;
  transform: boolean;
};

const jsonContentTypeHandler: ContentTypeHandler = {
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
    return req.headers.get('content-type') == 'application/json';
  },
  batching: true,
  transform: true,
};

const formDataContentTypeHandler: ContentTypeHandler = {
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

const octetStreamContentTypeHandler: ContentTypeHandler = {
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

const contentTypeHandlers = {
  list: [
    formDataContentTypeHandler,
    jsonContentTypeHandler,
    octetStreamContentTypeHandler,
  ],
  /**
   * Fallback handler if there is no match
   */
  fallback: jsonContentTypeHandler,
};

export function getContentTypeHandlerOrThrow(req: Request): ContentTypeHandler {
  const handler = contentTypeHandlers.list.find((handler) =>
    handler.isMatch(req),
  );
  if (handler) {
    return handler;
  }

  if (!handler && req.method === 'GET') {
    return contentTypeHandlers.fallback;
  }

  return contentTypeHandlers.fallback;
}
