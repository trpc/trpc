import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type { Operation, OperationLink, TRPCLink } from './types';

function asArray<TType>(value: TType | TType[]) {
  return Array.isArray(value) ? value : [value];
}

export function splitLink<
  TRouter extends AnyRouter = AnyRouter,
  TOptions extends string = never,
>(
  opts:
    | {
        condition(op: Operation): boolean;
        /**
         * The link to execute next if the test function returns `true`.
         */
        true: TRPCLink<TRouter> | TRPCLink<TRouter>[];
        /**
         * The link to execute next if the test function returns `false`.
         */
        false: TRPCLink<TRouter> | TRPCLink<TRouter>[];
        /**
         * Define custom keys for the options
         */
        options?: never;
      }
    | {
        condition(op: Operation): NoInfer<TOptions>;
        /**
         * Define custom keys for the options
         */
        options: Record<TOptions, TRPCLink<TRouter> | TRPCLink<TRouter>[]>;
      },
): TRPCLink<TRouter> {
  type $OptionRecord = Record<any, TRPCLink<TRouter> | TRPCLink<TRouter>[]>;
  const options: $OptionRecord = opts.options ?? {
    true: (opts as any).true,
    false: (opts as any).false,
  };
  return (runtime) => {
    const answers = Object.keys(options).reduce(
      (acc, key) => {
        acc[key] = asArray(options[key]).map(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (link) => link!(runtime),
        );

        return acc;
      },
      {} as Record<keyof $OptionRecord, OperationLink<TRouter>[]>,
    );

    return (props) => {
      return observable((observer) => {
        const answerKey = opts.condition(props.op);

        const links = answers[answerKey] as OperationLink<TRouter>[];

        return createChain({ op: props.op, links }).subscribe(observer);
      });
    };
  };
}
