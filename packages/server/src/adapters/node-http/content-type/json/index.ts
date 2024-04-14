// @trpc/server
import { TRPCError } from '../../../../@trpc/server';
import type {
  AnyRouter,
  CombinedDataTransformer,
} from '../../../../@trpc/server';
import type { NodeHTTPRequest, NodeHTTPResponse } from '../../types';
import type { NodeHTTPContentTypeHandler } from '../types';
import { getPostBody } from './getPostBody';

export const getNodeHTTPJSONContentTypeHandler: <
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>() => NodeHTTPContentTypeHandler<TRouter, TRequest, TResponse> = () => ({
  name: 'node-http-json',
  isMatch(opts) {
    return !!opts.req.headers['content-type']?.startsWith('application/json');
  },
  getInputs: async (opts, info) => {
    const bodyResult = await getPostBody(opts);
    if (!bodyResult.ok) {
      throw bodyResult.error;
    }
    const preprocessed = bodyResult.data;
    const body = bodyResult.data;

    function getRawProcedureInputOrThrow() {
      const { req } = opts;

      try {
        if (req.method === 'GET') {
          const query = req.query;
          if (!query?.['input']) {
            return undefined;
          }

          const raw = query['input'] as string;
          return JSON.parse(raw);
        }
        if (!preprocessed && typeof body === 'string') {
          // A mutation with no inputs will have req.body === ''
          return body.length === 0 ? undefined : JSON.parse(body);
        }
        return req.body;
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

    const rawInput = getRawProcedureInputOrThrow();
    const transformer = opts.router._def._config.transformer;

    if (!info.isBatchCall) {
      return deserializeInputValue(rawInput, transformer);
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

    const rawValue = rawInput[info.batch];

    return deserializeInputValue(rawValue, transformer);
  },
});
