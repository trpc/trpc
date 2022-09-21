import { UnaryFunction } from '../types';
import { identity } from './identity';

/** @internal */
export function pipeFromArray<TSource, TReturn>(
  fns: Array<UnaryFunction<TSource, TReturn>>,
): UnaryFunction<TSource, TReturn> {
  if (fns.length === 0) {
    return identity as UnaryFunction<any, any>;
  }

  if (fns.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return fns[0]!;
  }

  return function piped(input: TSource): TReturn {
    return fns.reduce(
      (prev: any, fn: UnaryFunction<TSource, TReturn>) => fn(prev),
      input as any,
    );
  };
}
