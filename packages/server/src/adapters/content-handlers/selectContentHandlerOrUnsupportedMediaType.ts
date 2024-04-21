import { TRPCError } from '../../@trpc/server';
import type {
  BaseContentTypeHandler,
  HTTPHeaders,
} from '../../@trpc/server/http';

interface MinimalHandlerOpts {
  req: {
    // TODO: This could probably only take Headers and do the conversion higher up,
    //       but that's a bigger refactor for another day
    headers: HTTPHeaders | Headers;
  };
}

export function selectContentHandlerOrUnsupportedMediaType<
  THandlerOpts extends MinimalHandlerOpts,
  THandler extends BaseContentTypeHandler<THandlerOpts>,
>(handlers: THandler[], opts: THandlerOpts) {
  const headers = new Headers(opts.req.headers as HeadersInit);
  const contentType = headers.get('content-type');

  if (contentType === null) {
    return [
      undefined,
      new TRPCError({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message:
          'No Content-Type header detected on the incoming request. This request may not be supported by your tRPC Adapter, or possibly by tRPC at all',
      }),
    ] as const;
  }

  const handler = handlers.find((handler) => handler.isMatch(headers));
  if (!handler) {
    return [
      undefined,
      new TRPCError({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: `Invalid Content-Type header '${contentType}'. This request may not be supported by your tRPC Adapter, or possibly by tRPC at all`,
      }),
    ] as const;
  }

  return [handler] as const;
}
