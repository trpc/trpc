import { TRPCError } from '../../@trpc/server';
import type { BaseContentTypeHandler } from '../../@trpc/server/http';

export function selectContentHandlerOrUnsupportedMediaType<
  THandlerOpts,
  THandler extends BaseContentTypeHandler<THandlerOpts>,
>(handlers: THandler[], opts: THandlerOpts) {
  const handler = handlers.find((handler) => handler.isMatch(opts));
  if (!handler) {
    return [
      undefined,
      new TRPCError({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Invalid Content-Type header (expected application/json)',
      }),
    ] as const;
  }

  return [handler] as const;
}
