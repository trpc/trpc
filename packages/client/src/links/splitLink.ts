import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type { Operation, OperationLink, TRPCLink } from './types';

function asArray<TType>(value: TType | TType[]) {
  return Array.isArray(value) ? value : [value];
}
export function splitLink<
  TRouter extends AnyRouter = AnyRouter,
  TReturn extends string | number = string,
>(
  opts: {
    condition: (op: Operation) => TReturn;
  } & {
    [TReturnValue in TReturn]: TRPCLink<TRouter> | TRPCLink<TRouter>[];
  },
): TRPCLink<TRouter>;
export function splitLink<TRouter extends AnyRouter = AnyRouter>(opts: {
  condition: (op: Operation) => boolean;
  /**
   * The link to execute next if the test function returns `true`.
   */
  true: TRPCLink<TRouter> | TRPCLink<TRouter>[];
  /**
   * The link to execute next if the test function returns `false`.
   */
  false: TRPCLink<TRouter> | TRPCLink<TRouter>[];
}): TRPCLink<TRouter>;
export function splitLink<TRouter extends AnyRouter = AnyRouter>(
  opts: {
    condition: (op: Operation) => any;
  } & Record<any, TRPCLink<TRouter> | TRPCLink<TRouter>[]>,
): TRPCLink<TRouter> {
  return (runtime) => {
    const answers = Object.keys(opts).reduce(
      (acc, key) => {
        if (key === 'condition') {
          return acc;
        }

        acc[key] = asArray(opts[key]).map((link) =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          link!(runtime),
        );

        return acc;
      },
      {} as Record<any, OperationLink<TRouter>[]>,
    );

    return (props) => {
      return observable((observer) => {
        const answerKey = opts.condition(props.op);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const links = answers[answerKey]!;

        return createChain({ op: props.op, links }).subscribe(observer);
      });
    };
  };
}
