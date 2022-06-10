import { OnErrorFunction } from './OnErrorFunction__tmp';
import { AnyRouter } from '../core/router';

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
