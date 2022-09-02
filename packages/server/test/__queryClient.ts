import { Logger, QueryClient, QueryClientConfig } from '@tanstack/react-query';

type Config = Omit<Partial<QueryClientConfig>, 'logger'>;
export function createQueryClientOptions(config: Config | undefined) {
  type LogFn = Logger['error'];
  const noopLogFn: LogFn = () => {
    // noop
  };
  const logger = {
    error: jest.fn(noopLogFn),
    warn: jest.fn(noopLogFn),
    log: jest.fn(noopLogFn),
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

export function createQueryClient(config?: Config) {
  const options = createQueryClientOptions(config);
  const queryClient = new QueryClient(options) as QueryClient & {
    $logger: typeof options.logger;
  };
  queryClient.$logger = options.logger;

  return queryClient;
}
