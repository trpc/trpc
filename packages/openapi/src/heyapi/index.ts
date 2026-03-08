/**
 * hey-api client configuration helpers for tRPC OpenAPI.
 *
 * Provides `createTRPCHeyApiClientConfig` which returns a config object
 * (querySerializer, bodySerializer, responseTransformer) that can be spread
 * into a hey-api client's `setConfig()` call.
 *
 * @example
 * ```ts
 * import { createTRPCHeyApiClientConfig } from '@trpc/openapi/heyapi';
 * import { client } from './generated/client.gen';
 *
 * // Without a transformer
 * client.setConfig({ baseUrl, ...createTRPCHeyApiClientConfig() });
 *
 * // With superjson
 * import superjson from 'superjson';
 * client.setConfig({ baseUrl, ...createTRPCHeyApiClientConfig({ transformer: superjson }) });
 * ```
 */

import type { Config } from '@hey-api/client-fetch';
import type {
  TRPCCombinedDataTransformer,
  TRPCDataTransformer,
} from '@trpc/server';

export type DataTransformerOptions =
  | TRPCDataTransformer
  | TRPCCombinedDataTransformer;

function resolveTransformer(
  transformer: DataTransformerOptions,
): TRPCCombinedDataTransformer {
  if ('input' in transformer) {
    return transformer;
  }
  return { input: transformer, output: transformer };
}

export interface TRPCHeyApiClientOptions {
  transformer?: DataTransformerOptions;
}

export type TRPCHeyApiClientConfig = Required<Pick<Config, 'querySerializer'>> &
  Pick<Config, 'bodySerializer' | 'responseTransformer'>;

export function createTRPCHeyApiClientConfig(opts?: TRPCHeyApiClientOptions) {
  const transformer = opts?.transformer
    ? resolveTransformer(opts.transformer)
    : undefined;

  return {
    querySerializer: (query: Record<string, unknown>) => {
      const params = new URLSearchParams();

      for (const [key, value] of Object.entries(query)) {
        if (key === 'input' && transformer) {
          params.append(
            key,
            JSON.stringify(transformer.input.serialize(value)),
          );
        } else {
          params.append(key, JSON.stringify(value));
        }
      }

      return params.toString();
    },

    ...(transformer && {
      bodySerializer: (body: unknown) => {
        return JSON.stringify(transformer.input.serialize(body));
      },

      responseTransformer: async (data: unknown) => {
        if (!!data && typeof data === 'object' && 'result' in data) {
          (data as any).result.data = transformer.output.deserialize(
            (data as any).result.data,
          );
        }
        if (!!data && typeof data === 'object' && 'error' in data) {
          (data as any).error.data = transformer.output.deserialize(
            (data as any).error.data,
          );
        }

        return data;
      },
    }),
  } as const satisfies TRPCHeyApiClientConfig;
}
