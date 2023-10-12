import { tsonAsyncIterator, TsonAsyncOptions, tsonPromise } from 'tupleson';

/**
 * @internal
 */
export function unstable_createTsonAsyncOptions(
  opts: Partial<TsonAsyncOptions> | undefined,
): TsonAsyncOptions {
  if (!opts) {
    return {
      types: [tsonPromise, tsonAsyncIterator],
    };
  }
  const _opts: TsonAsyncOptions = {
    ...opts,
    types: [...(opts.types ?? [])],
  };

  // make sure tsonAsyncIterator and tsonPromise is always included even if not passed
  if (!_opts.types.find((it) => it.key === tsonPromise.key)) {
    _opts.types.push(tsonPromise);
  }
  if (!_opts.types.find((it) => it.key === tsonAsyncIterator.key)) {
    _opts.types.push(tsonAsyncIterator);
  }

  return _opts;
}
