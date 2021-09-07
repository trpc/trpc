import { OnErrorFunction } from './OnErrorFunction';
import { AnyRouter } from '../router';

/**
 * Base interface for any response handler
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  router: TRouter;
}
