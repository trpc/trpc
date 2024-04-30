// @trpc/server
import { TRPCError } from '../../../../@trpc/server';
import type {
  AnyRouter,
  CombinedDataTransformer,
} from '../../../../@trpc/server';
import type { BaseContentTypeHandler } from '../../../../@trpc/server/http';
import { createConcurrentCache } from '../../../content-handlers/concurrentCache';
import type { FetchHandlerRequestOptions } from '../../types';

export interface FetchHTTPContentTypeHandler<TRouter extends AnyRouter>
  extends BaseContentTypeHandler<
    FetchHandlerRequestOptions<TRouter> & {
      url: URL;
    }
  > {}

export const getFetchHTTPJSONContentTypeHandler: <
  TRouter extends AnyRouter,
>() => FetchHTTPContentTypeHandler<TRouter> = () => {
  const cache = createConcurrentCache();

  return {
    name: 'fetch-json',
    isMatch: (headers) => {
      return !!headers.get('content-type')?.startsWith('application/json');
    },
    getInputs: async (opts, info) => {
      async function getRawProcedureInputOrThrow() {
        try {
          if (opts.url.searchParams.has('input')) {
            const input = opts.url.searchParams.get('input');
            if (!input) {
              return undefined;
            }

            return JSON.parse(input);
          }

          return await opts.req.json();
        } catch (cause) {
          throw new TRPCError({
            code: 'PARSE_ERROR',
            cause,
          });
        }
      }

      const deserializeInputValue = (
        rawValue: unknown,
        transformer: CombinedDataTransformer,
      ) => {
        return typeof rawValue !== 'undefined'
          ? transformer.input.deserialize(rawValue)
          : rawValue;
      };

      const rawInput = await cache.concurrentSafeGet('rawInput', () =>
        getRawProcedureInputOrThrow(),
      );
      if (rawInput === undefined) {
        return undefined;
      }

      const transformer = opts.router._def._config.transformer;

      if (!info.isBatchCall) {
        return cache.concurrentSafeGet('input', () =>
          deserializeInputValue(rawInput, transformer),
        );
      }

      /* istanbul ignore if  */
      if (
        rawInput == null ||
        typeof rawInput !== 'object' ||
        Array.isArray(rawInput)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '"input" needs to be an object when doing a batch call',
        });
      }

      return cache.concurrentSafeGet(String(info.batch), () =>
        deserializeInputValue(rawInput[info.batch], transformer),
      );
    },
  };
};
