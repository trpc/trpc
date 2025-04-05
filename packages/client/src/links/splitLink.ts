import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type { Operation, OperationLink, TRPCLink } from './types';

function asArray<TType>(value: TType | TType[]): TType[] {
  return Array.isArray(value) ? value : [value];
}

export function splitLink<
  TRouter extends AnyRouter = AnyRouter,
  TOptions extends string = never,
>(
  opts:
    | {
        /**
         * Function that determines which link(s) to execute based on the operation
         */
        condition: (op: Operation) => boolean;
        /**
         * The link(s) to execute next if the condition returns `true`
         */
        true: TRPCLink<TRouter> | TRPCLink<TRouter>[];
        /**
         * The link(s) to execute next if the condition returns `false`
         */
        false: TRPCLink<TRouter> | TRPCLink<TRouter>[];

        /**
         * Use this if you want to define custom keys for the options
         */
        options?: never;
      }
    | {
        /**
         * Function that determines which link(s) to execute based on the operation
         */
        condition: (op: Operation) => TOptions;
        /**
         * Record mapping string keys to link(s) that should be executed when the condition returns that key
         * The possible keys are inferred from the return type of `condition`
         */
        options: Record<string, TRPCLink<TRouter> | TRPCLink<TRouter>[]>;
      },
): TRPCLink<TRouter> {
  type $OptionRecord = Record<any, TRPCLink<TRouter> | TRPCLink<TRouter>[]>;
  const options: $OptionRecord = opts.options ?? {
    true: (opts as any).true,
    false: (opts as any).false,
  };
  return (runtime) => {
    const operationLinkRecord = Object.keys(options).reduce(
      (acc, key) => {
        acc[key] = asArray(options[key]).map(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (link) => link!(runtime),
        );

        return acc;
      },
      {} as Record<keyof $OptionRecord, OperationLink<TRouter>[]>,
    );

    return (props) =>
      observable((observer) => {
        const answerKey = opts.condition(props.op);

        const links = operationLinkRecord[
          answerKey
        ] as OperationLink<TRouter>[];

        return createChain({ op: props.op, links }).subscribe(observer);
      });
  };
}
