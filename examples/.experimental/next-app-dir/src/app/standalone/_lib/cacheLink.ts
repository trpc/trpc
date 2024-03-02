import type {
  TRPCClientError,
  TRPCLink,
  TRPCLinkDecoratorObject,
} from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { observable, share, tap } from '@trpc/server/observable';
/* istanbul ignore file -- @preserve */
// We're not actually exporting this link
import type { Observable, Unsubscribable } from '@trpc/server/observable';
import type {
  AnyRouter,
  ProcedureType,
} from '@trpc/server/unstable-core-do-not-import';

export const normalize = (opts: {
  path: string[] | string;
  input: unknown;
  type: ProcedureType;
}) => {
  return JSON.stringify({
    path: Array.isArray(opts.path) ? opts.path.join('.') : opts.path,
    input: opts.input,
    type: opts.type,
  });
};

/**
 * @link https://trpc.io/docs/v11/client/links/cacheLink
 */
export function cacheLink<TRouter extends AnyTRPCRouter>(): TRPCLink<
  TRouter,
  TRPCLinkDecoratorObject<{
    query: {
      /**
       * If true, the cache will be ignored and the request will be made as if it was the first time
       */
      ignoreCache: boolean;
    };
    runtime: {
      cache: Record<
        string,
        {
          observable: Observable<unknown, TRPCClientError<AnyRouter>>;
        }
      >;
    };
  }>
> {
  // initialized config
  return (runtime) => {
    // initialized in app
    const cache: Record<
      string,
      {
        observable: Observable<unknown, TRPCClientError<TRouter>>;
      }
    > = {};
    runtime.cache = cache;
    return (opts) => {
      const normalized = normalize({
        input: opts.op.input,
        path: opts.op.path,
        type: opts.op.type,
      });

      let cached = cache[normalized];
      if (!cached) {
        cached = cache[normalized] = {
          observable: observable((observer) => {
            const subscription = opts.next(opts.op).subscribe({
              ...observer,
              error(e) {
                observer.error(e);
              },
              complete() {
                observer.complete();
              },
            });
            return () => {
              subscription.unsubscribe();
            };
          }).pipe(share()),
        };
      }

      console.log({ cached });

      return cached.observable;
    };
  };
}

/**
 * @link https://trpc.io/docs/v11/client/links/loggerLink
 */
export function testDecorationLink<TRouter extends AnyTRPCRouter>(
  // eslint-disable-next-line @typescript-eslint/ban-types
  _opts: {} = {},
): TRPCLink<
  TRouter,
  TRPCLinkDecoratorObject<{
    query: {
      /**
       * I'm just here for testing inference
       */
      __fromTestLink1: true;
    };
    mutation: {
      /**
       * I'm just here for testing inference
       */
      __fromTestLink2: true;
    };
  }>
> {
  return () => {
    return (opts) => {
      return observable((observer) => {
        return opts
          .next(opts.op)
          .pipe(
            tap({
              next(result) {
                // logResult(result);
              },
              error(result) {
                // logResult(result);
              },
            }),
          )
          .subscribe(observer);
      });
    };
  };
}

export function refetchLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        let next$: Unsubscribable | null = null;
        let nextTimer: ReturnType<typeof setTimeout> | null = null;
        let attempts = 0;
        let isDone = false;
        function attempt() {
          console.log('fetching.......');
          attempts++;
          next$?.unsubscribe();
          next$ = next(op).subscribe({
            error(error) {
              observer.error(error);
            },
            next(result) {
              observer.next(result);

              if (nextTimer) {
                clearTimeout(nextTimer);
              }
              nextTimer = setTimeout(() => {
                attempt();
              }, 3000);
            },
            complete() {
              if (isDone) {
                observer.complete();
              }
            },
          });
        }
        attempt();
        return () => {
          isDone = true;
          next$?.unsubscribe();
        };
      });
    };
  };
}
