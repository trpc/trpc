import { QueryClient, QueryClientConfig } from '@tanstack/react-query';

type Config = Omit<Partial<QueryClientConfig>, 'logger'>;
export function createQueryClientConfig(config: Config | undefined) {
  return {
    ...config,
    defaultOptions: {
      ...config?.defaultOptions,
      queries: {
        retryDelay() {
          return 1;
        },
        ...config?.defaultOptions?.queries,
      },
    },
  };
}

/**
 * Create a QueryClient with default config
 */
export function createQueryClient(config?: Config) {
  const options = createQueryClientConfig(config);
  const queryClient = new QueryClient(options);

  return queryClient;
}
