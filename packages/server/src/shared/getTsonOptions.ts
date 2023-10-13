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
    types: [...(opts.types ?? [])],
  };

  // make sure tsonAsyncIterable and tsonPromise is always included even if not passed
  if (!_opts.types.find((it) => it.key === tsonPromise.key)) {
    _opts.types.push(tsonPromise);
  }
  if (!_opts.types.find((it) => it.key === tsonAsyncIterable.key)) {
    _opts.types.push(tsonAsyncIterable);
  }

  return _opts;
}
