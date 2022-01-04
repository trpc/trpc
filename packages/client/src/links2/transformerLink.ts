import {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
} from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { observable } from '../rx/observable';
import { TRPCLink } from './core';

function transformTRPCResponseItem<TItem extends TRPCResponse>(
  item: TItem,
  transformer: DataTransformer,
): TItem {
  if ('error' in item) {
    return {
      ...item,
      error: transformer.deserialize(item.error),
    };
  }
  if (item.result.type !== 'data') {
    return item;
  }
  return {
    ...item,
    result: {
      ...item.result,
      data: transformer.deserialize(item.result.data),
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
            const transformed = transformTRPCResponseItem(value, transformer);
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
