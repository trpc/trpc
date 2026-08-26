import type {
  FetchClient as HeyApiFetchClient,
  UserConfig,
} from '@hey-api/openapi-ts';
import type {
  TRPCCombinedDataTransformer,
  TRPCDataTransformer,
} from '@trpc/server';

export type DataTransformerOptions =
  | TRPCDataTransformer
  | TRPCCombinedDataTransformer;

type HeyAPIResolvers = Exclude<
  Extract<
    Exclude<UserConfig['plugins'], undefined | string>[number],
    { name: '@hey-api/typescript' }
  >['~resolvers'],
  undefined
>;

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

export type HeyApiConfig = ReturnType<HeyApiFetchClient['getConfig']>;
export type TRPCHeyApiClientConfig = Required<
  Pick<HeyApiConfig, 'querySerializer'>
> &
  Pick<HeyApiConfig, 'bodySerializer' | 'responseTransformer'>;

/**
 * Returns the `~resolvers` object for the `@hey-api/typescript` plugin.
 *
 * Maps `date` and `date-time` string formats to `Date` so that the
 * generated SDK uses `Date` instead of `string` for those fields.
 *
 * @example
 * ```ts
 * import { createClient } from '@hey-api/openapi-ts';
 * import { createTRPCHeyApiTypeResolvers } from '@trpc/openapi/heyapi';
 *
 * await createClient({
 *   plugins: [
 *     { name: '@hey-api/typescript', '~resolvers': createTRPCHeyApiTypeResolvers() },
 *   ],
 * });
 * ```
 */
export function createTRPCHeyApiTypeResolvers(): HeyAPIResolvers {
  return {
    string(ctx) {
      if (ctx.schema.format === 'date-time' || ctx.schema.format === 'date') {
        return ctx.$.type('Date');
      }
      return undefined;
    },
    number(ctx) {
      if (ctx.schema.format === 'bigint') {
        return ctx.$.type('bigint');
      }
      return undefined;
    },
  };
}

/**
 * @internal - Prefer `configureTRPCHeyApiClient`
 */
export function createTRPCHeyApiClientConfig(opts?: TRPCHeyApiClientOptions) {
  const transformer = opts?.transformer
    ? resolveTransformer(opts.transformer)
    : undefined;

  return {
    querySerializer: (query: Record<string, unknown>) => {
      const params = new URLSearchParams();

      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) {
          continue;
        }

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
          const result = (data as any).result;
          if (!result.type || result.type === 'data') {
            result.data = transformer.output.deserialize(result.data);
          }
        }

        return data;
      },
    }),
  } as const satisfies TRPCHeyApiClientConfig;
}

/**
 * @internal - Prefer `configureTRPCHeyApiClient`
 */
export function createTRPCErrorInterceptor(
  transformerOpts: DataTransformerOptions,
) {
  const transformer = resolveTransformer(transformerOpts);
  return (error: unknown) => {
    if (!!error && typeof error === 'object' && 'error' in error) {
      (error as any).error = transformer.output.deserialize(
        (error as any).error,
      );
    }
    return error;
  };
}

/**
 * Configures a hey-api client for use with a tRPC OpenAPI backend.
 *
 * Sets up querySerializer, bodySerializer, responseTransformer, and
 * an error interceptor (for transformer-based error deserialization)
 * in a single call.
 *
 * @example
 * ```ts
 * import { configureTRPCHeyApiClient } from '@trpc/openapi/heyapi';
 * import superjson from 'superjson';
 * import { client } from './generated/client.gen';
 *
 * configureTRPCHeyApiClient(client, {
 *   baseUrl: 'http://localhost:3000',
 *   transformer: superjson,
 * });
 * ```
 */
export function configureTRPCHeyApiClient(
  client: HeyApiFetchClient,
  opts: TRPCHeyApiClientOptions &
    Omit<HeyApiConfig, keyof TRPCHeyApiClientConfig>,
) {
  const { transformer, ...heyConfig } = opts;
  const trpcConfig = createTRPCHeyApiClientConfig({ transformer });

  client.setConfig({ ...heyConfig, ...trpcConfig });

  if (transformer) {
    client.interceptors.error.use(createTRPCErrorInterceptor(transformer));
  }
}
