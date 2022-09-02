import { Logger, QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  type LogFn = Logger['error'];
  const noopLogFn: LogFn = () => {
    // noop
  };
  const logger = {
    error: jest.fn(noopLogFn),
    warn: jest.fn(noopLogFn),
    log: jest.fn(noopLogFn),
  };

  const queryClient = new QueryClient({
    logger,
  }) as QueryClient & {
    $logger: typeof logger;
  };
  queryClient.$logger = logger;

  return queryClient;
}
