/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  TsonNonce,
  TsonOptions,
  TsonTransformerEncodeDecode,
  TsonTuple,
  TsonTypeTesterCustom,
  TsonTypeTesterPrimitive,
} from './types';

function isTsonTuple(v: unknown, nonce: string): v is TsonTuple {
  return Array.isArray(v) && v.length === 3 && v[0] === nonce;
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
        const [, type, serializedValue] = value;
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
  // warmup the type handlers
  const types = Object.entries(opts.types).map(([key, value]) => {
    return {
      ...value,
      $encode(v: unknown, nonce: TsonNonce) {
        if (value.transform === false) {
          return v;
        }
        const result: TsonTuple = [nonce, key, value.encode(v)];
        return result;
      },
    };
  });
  type Handler = (typeof types)[number];

  const handlerPerPrimitive: Record<
    string,
    Extract<Handler, TsonTypeTesterPrimitive>
  > = {};
  const customTypeHandlers: Extract<Handler, TsonTypeTesterCustom>[] = [];

  for (const handler of types) {
    if (handler.primitive) {
      handlerPerPrimitive[handler.primitive] = handler;
    } else {
      customTypeHandlers.push(
        handler as Extract<Handler, TsonTypeTesterCustom>,
      );
    }
  }

  return function stringify(obj: unknown, space?: string | number) {
    const nonce = typeof opts.nonce === 'function' ? opts.nonce() : '__tson';

    const tson = JSON.stringify(
      obj,
      function replacer(_key, value) {
        const vType = typeof value;

        const primitiveHandler = handlerPerPrimitive[vType];
        if (primitiveHandler) {
          return primitiveHandler.$encode(value, nonce);
        }
        for (const handler of customTypeHandlers) {
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
