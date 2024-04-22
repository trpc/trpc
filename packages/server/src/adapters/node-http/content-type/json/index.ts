// @trpc/server
import { TRPCError } from '../../../../@trpc/server';
import type {
  AnyRouter,
  CombinedDataTransformer,
} from '../../../../@trpc/server';
import { createConcurrentCache } from '../../../content-handlers/concurrentCache';
import type { NodeHTTPRequest, NodeHTTPResponse } from '../../types';
import type { NodeHTTPContentTypeHandler } from '../types';
import { getPostBody } from './getPostBody';

export const getNodeHTTPJSONContentTypeHandler: <
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>() => NodeHTTPContentTypeHandler<TRouter, TRequest, TResponse> = () => {
  const rawInputCache = createConcurrentCache();
  const inputCache = createConcurrentCache();

  return {
    name: 'node-http-json',
    isMatch: (headers) => {
      return !!headers.get('content-type')?.startsWith('application/json');
    },
    getInputs: async (opts, info) => {
      async function getRawProcedureInputOrThrow() {
        const bodyResult = await getPostBody(opts);
        if (!bodyResult.ok) {
          throw bodyResult.error;
        }

        const preprocessedBody = bodyResult.preprocessed;
        const body = bodyResult.data;

        try {
          if (opts.req.method === 'GET') {
            const input = opts.query.get('input');
            if (!input) {
              return undefined;
            }

            return JSON.parse(input);
          }

          if (preprocessedBody || typeof body !== 'string') {
            // Some tools like nextjs may parse json
            // requests before they reach us. So we just use them as is
            return body;
          } else {
            return JSON.parse(body);
          }
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

      const rawInput = await rawInputCache.concurrentSafeGet('input', () =>
        getRawProcedureInputOrThrow(),
      );
      if (rawInput === undefined) {
        return undefined;
      }

      const transformer = opts.router._def._config.transformer;

      if (!info.isBatchCall) {
        return await inputCache.concurrentSafeGet('input', () =>
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

      return await inputCache.concurrentSafeGet(String(info.batch), () =>
        deserializeInputValue(rawInput[info.batch], transformer),
      );
    },
  };
};
