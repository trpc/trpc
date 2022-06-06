import { AnyRouter } from '../router';
import { OnErrorFunction } from './onErrorFunction';

/**
 * Base interface for any response handler
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  router: TRouter;
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  methodOverride?: {
    enabled: boolean;
  };
}
