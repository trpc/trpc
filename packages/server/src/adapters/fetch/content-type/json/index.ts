// @trpc/server
import { TRPCError } from '../../../../@trpc/server';
import type {
  AnyRouter,
  CombinedDataTransformer,
} from '../../../../@trpc/server';
import type { FetchContentTypeHandler } from '../../types';

export const getFetchHTTPJSONContentTypeHandler: <
  TRouter extends AnyRouter,
  TRequest extends Request,
>() => FetchContentTypeHandler<TRouter, TRequest> = () => ({
  name: 'fetch-json',
  isMatch(opts) {
    return !!opts.req.headers
      .get('content-type')
      ?.startsWith('application/json');
  },
  getInputs: async (opts, info) => {
    async function getRawProcedureInputOrThrow() {
      const { req } = opts;

      try {
        if (req.method === 'GET') {
          const input = opts.url.searchParams.get('input');
          if (!input) {
            return undefined;
          }

          return JSON.parse(input);
        }

        const body = opts.req.headers
          .get('content-type')
          ?.startsWith('application/json')
          ? await opts.req.text()
          : '';

        if (typeof body === 'string') {
          // A mutation with no inputs will have req.body === ''
          return body.length === 0 ? undefined : JSON.parse(body);
        }

        return body;
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

    const rawInput = await getRawProcedureInputOrThrow();
    if (rawInput === undefined) {
      return undefined;
    }

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
