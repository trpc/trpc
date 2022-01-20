import {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
} from '@trpc/server';
import { observable } from '../rx/observable';
import { OperationResult, TRPCLink } from './types';

/**
 * @internal
 */
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
export function transformerLink<TRouter extends AnyRouter = AnyRouter>(
  transformer: ClientDataTransformerOptions,
): TRPCLink<TRouter> {
  const _transformer: DataTransformer = transformer
    ? 'input' in transformer
      ? {
          serialize: transformer.input.serialize,
          deserialize: transformer.output.deserialize,
        }
      : transformer
    : {
        serialize: (data) => data,
        deserialize: (data) => data,
      };

  return () => {
    return (props) => {
      const input = _transformer.serialize(props.op.input);
      return observable((observer) => {
        const next$ = props.next({ ...props.op, input }).subscribe({
          next(value) {
            const transformed = transformOperationResult(value, _transformer);
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
