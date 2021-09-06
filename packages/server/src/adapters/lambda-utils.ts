import { AnyRouter, inferRouterContext } from '../router';
import { HTTPBaseHandlerOptions } from '../http/internals/types';

export type LambdaCreateContextFnOptions<TRequest> = TRequest;

export type LambdaCreateContextFn<TRouter extends AnyRouter, TRequest> = (
    opts: LambdaCreateContextFnOptions<TRequest>,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

export type AWSLambdaOptions<
    TRouter extends AnyRouter,
    TRequest,
    > = HTTPBaseHandlerOptions<TRouter, TRequest> &
    (inferRouterContext<TRouter> extends void
        ? {
            /**
             * @link https://trpc.io/docs/context
             **/
            createContext?: LambdaCreateContextFn<TRouter, TRequest>;
        }
        : {
            /**
             * @link https://trpc.io/docs/context
             **/
            createContext: LambdaCreateContextFn<TRouter, TRequest>;
        });
