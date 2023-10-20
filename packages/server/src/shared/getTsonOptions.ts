import { tsonAsyncIterable, TsonAsyncOptions, tsonPromise } from 'tupleson';

/**
 * @internal
 */
export function unstable_createTsonAsyncOptions(
  opts: Partial<TsonAsyncOptions> | undefined,
): TsonAsyncOptions {
  if (!opts) {
    return {
      types: [tsonPromise, tsonAsyncIterable],
    };
  }
  const _opts: TsonAsyncOptions = {
    ...opts,
    types: [
      // make sure tsonAsyncIterable and tsonPromise is always included even if not passed
      tsonPromise,
      tsonAsyncIterable,
      ...(opts.types ?? []).filter(
        (it) => it.key !== tsonPromise.key && it.key !== tsonAsyncIterable.key,
      ),
    ],
  };

  return _opts;
}
