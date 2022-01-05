import {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
} from '@trpc/server';
import { observable } from '../rx/observable';
import { OperationResult, TRPCLink } from './core';

function transformOperationResult<TResult extends OperationResult<any, any>>(
  result: TResult,
  transformer: DataTransformer,
) {
  if ('error' in result.data) {
    return {
      ...result,
      data: {
        ...result.data,
        error: transformer.deserialize(result.data.error),
      },
    };
  }
  if (result.data.result.type !== 'data') {
    return result;
  }
  return {
    ...result,
    data: {
      ...result.data,
      result: {
        ...result.data.result,
        data: transformer.deserialize(result.data.result.data),
      },
    },
  };
}
export function splitLink<TRouter extends AnyRouter = AnyRouter>(opts: {
  transformer: ClientDataTransformerOptions;
}): TRPCLink<TRouter> {
  const transformer: DataTransformer = opts.transformer
    ? 'input' in opts.transformer
      ? {
          serialize: opts.transformer.input.serialize,
          deserialize: opts.transformer.output.deserialize,
        }
      : opts.transformer
    : {
        serialize: (data) => data,
        deserialize: (data) => data,
      };

  return () => {
    return (props) => {
      const input = transformer.serialize(props.op.input);
      return observable((observer) => {
        const next$ = props.next({ ...props.op, input }).subscribe({
          next(value) {
            const transformed = transformOperationResult(value, transformer);
            observer.next(transformed);
          },
          error: observer.error,
          complete: observer.complete,
        });
        return next$;
      });
    };
  };
}
