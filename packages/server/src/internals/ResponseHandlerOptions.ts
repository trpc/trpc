import { AnyRouter } from '..';
import { HTTPRequest } from '../http/internals/HTTPResponse';
import { OnErrorFunction } from './OnErrorFunction';

export interface ResponseHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
> {
  teardown?: () => Promise<void>;
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  router: TRouter;
}
