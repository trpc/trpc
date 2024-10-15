import type { QueryClientConfig, QueryKey } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';

/**
 * @internal
 */
export type CreateTRPCReactQueryClientConfig =
  | {
      queryClient?: QueryClient;
      queryClientConfig?: never;
    }
  | {
      queryClientConfig?: QueryClientConfig;
      queryClient?: never;
    };

/**
 * @internal
 */
export const getQueryClient = (config: CreateTRPCReactQueryClientConfig) =>
  config.queryClient ?? new QueryClient(config.queryClientConfig);

export async function buildQueryFromAsyncIterable(
  asyncIterable: AsyncIterable<unknown>,
  queryClient: QueryClient,
  queryKey: QueryKey,
) {
  const queryCache = queryClient.getQueryCache();

  const query = queryCache.build(queryClient, {
    queryKey,
  });

  query.setState({
    data: [],
    status: 'success',
  });

  const aggregate: unknown[] = [];
  for await (const value of asyncIterable) {
    aggregate.push(value);

    query.setState({
      data: [...aggregate],
    });
  }
  return aggregate;
}
