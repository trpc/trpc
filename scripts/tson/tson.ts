/* eslint-disable max-params */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  TsonAllTypes,
  TsonNonce,
  TsonOptions,
  TsonTransformerEncodeDecode,
  TsonTuple,
  TsonTypeHandlerKey,
  TsonTypeTesterCustom,
  TsonTypeTesterPrimitive,
} from './types';

function isTsonTuple(v: unknown, nonce: string): v is TsonTuple {
  return Array.isArray(v) && v.length === 3 && v[0] === nonce;
}

function getHandlers(opts: TsonOptions) {
  // warmup the type handlers
  const types = Object.entries(opts.types).map(([key, value]) => {
    return {
      ...value,
      $encode(v: unknown, nonce: TsonNonce) {
        if (value.transform === false) {
          return v;
        }
        const result: TsonTuple = [
          key as TsonTypeHandlerKey,
          value.encode(v),
          nonce,
        ];
        return result;
      },
    };
  });
  type Handler = (typeof types)[number];

  const handlerPerPrimitive: Partial<
    Record<TsonAllTypes, Extract<Handler, TsonTypeTesterPrimitive>>
  > = {};
  const customTypeHandlers: Extract<Handler, TsonTypeTesterCustom>[] = [];

  for (const handler of types) {
    if (handler.primitive) {
      if (handlerPerPrimitive[handler.primitive]) {
        throw new Error(
          `Multiple handlers for primitive ${handler.primitive} found`,
        );
      }
      handlerPerPrimitive[handler.primitive] = handler;
    } else {
      customTypeHandlers.push(handler);
    }
  }
  return {
    primitive: handlerPerPrimitive,
    custom: customTypeHandlers,
  };
}

function getNonce(maybeFn: TsonOptions['nonce']) {
  return typeof maybeFn === 'function'
    ? (maybeFn() as TsonNonce)
    : ('__tson' as TsonNonce);
}
export function tsonParser(opts: TsonOptions) {
  return function parse(str: string) {
    let nonce = '';
    const encoded = JSON.parse(str, function (_key, value: unknown) {
      if (!nonce) {
        // first value is always the nonce
        nonce = value as string;
        return value;
      }
      if (isTsonTuple(value, nonce)) {
        const [type, serializedValue] = value;
        const transformer = opts.types[
          type
        ] as TsonTransformerEncodeDecode<unknown>;
        return transformer.decode(serializedValue);
      }
      return value;
    });

    return encoded[1];
  };
}

export function tsonStringifier(opts: TsonOptions) {
  const handlers = getHandlers(opts);
  const maybeNonce = opts.nonce;

  return function stringify(obj: unknown, space?: string | number) {
    const nonce = getNonce(maybeNonce);

    const tson = JSON.stringify(
      obj,
      function replacer(_key, value) {
        const vType = typeof value;

        const primitiveHandler = handlers.primitive[vType];
        if (primitiveHandler) {
          if (!primitiveHandler.test || primitiveHandler.test(value)) {
            return primitiveHandler.$encode(value, nonce);
          }
        }
        for (const handler of handlers.custom) {
          if (handler.test(value)) {
            return handler.$encode(value, nonce);
          }
        }

        return value;
      },
      space,
    );
    return `["${nonce}", ${tson}]`;
  };
}
