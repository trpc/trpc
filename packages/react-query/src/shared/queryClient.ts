import type { QueryClientConfig } from '@tanstack/react-query';
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
