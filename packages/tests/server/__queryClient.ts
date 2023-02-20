import { Logger, QueryClient, QueryClientConfig } from '@tanstack/react-query';

type Config = Omit<Partial<QueryClientConfig>, 'logger'>;
export function createQueryClientConfig(config: Config | undefined) {
  type LogFn = Logger['error'];
  const noopLogFn: LogFn = () => {
    // noop
  };
  const logger = {
    error: vi.fn(noopLogFn),
    warn: vi.fn(noopLogFn),
    log: vi.fn(noopLogFn),
  };
  return {
    ...config,
    logger,
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
  const queryClient = new QueryClient(options) as QueryClient & {
    $logger: typeof options.logger;
  };
  queryClient.$logger = options.logger;

  return queryClient;
}
