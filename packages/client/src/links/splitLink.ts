import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type { Operation, OperationLink, TRPCLink } from './types';

function asArray<TType>(value: TType | TType[]) {
  return Array.isArray(value) ? value : [value];
}

type Keyish<TReturnKey extends string | number | boolean> =
  TReturnKey extends boolean
    ? TReturnKey extends true
      ? 'true'
      : 'false'
    : TReturnKey;

export function splitLink<
  TReturnKey extends string | number | boolean,
  TRouter extends AnyRouter = AnyRouter,
>(opts: {
  condition(op: Operation): TReturnKey;
  options: Record<
    Keyish<NoInfer<TReturnKey>>,
    TRPCLink<TRouter> | TRPCLink<TRouter>[]
  >;
}): TRPCLink<TRouter> {
  return (runtime) => {
    const answers = Object.keys(opts.options).reduce(
      (acc, key) => {
        acc[key as Keyish<TReturnKey>] = asArray(
          opts.options[key as Keyish<TReturnKey>],
        ).map((link) => link(runtime));

        return acc;
      },
      {} as Record<Keyish<TReturnKey>, OperationLink<TRouter>[]>,
    );

    return (props) => {
      return observable((observer) => {
        const answerKey = opts.condition(props.op);

        const links = answers[answerKey as Keyish<TReturnKey>];

        return createChain({ op: props.op, links }).subscribe(observer);
      });
    };
  };
}
