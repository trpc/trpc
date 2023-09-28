/* eslint-disable max-params */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  TsonAllTypes,
  TsonEncodedValue,
  TsonNonce,
  TsonOptions,
  TsonSerialized,
  TsonTransformerEncodeDecode,
  TsonTuple,
  TsonTypeHandlerKey,
  TsonTypeTesterCustom,
  TsonTypeTesterPrimitive,
} from './types';

function isTsonTuple(v: unknown, nonce: string): v is TsonTuple {
  return Array.isArray(v) && v.length === 3 && v[2] === nonce;
}

function getHandlers(opts: TsonOptions) {
  // warmup the type handlers
  const types = Object.entries(opts.types).map(([_key, _handler]) => {
    const handler = typeof _handler === 'function' ? _handler() : _handler;
    const key = _key as TsonTypeHandlerKey;
    const encode = handler.encode;

    type WalkCallback = (innerValue: unknown) => unknown;
    type Encoder = (
      value: unknown,
      nonce: TsonNonce,
      walk?: WalkCallback,
    ) => TsonEncodedValue;

    const $encode: Encoder = encode
      ? (value, nonce, walk) => {
          const encoded = encode(value);
          const walked = walk ? walk(encoded) : encoded;
          const result: TsonTuple = [key, walked, nonce];
          return result;
        }
      : (value, _nonce, walk) => {
          return walk ? walk(value) : value;
        };
    return {
      ...handler,
      key,
      $encode,
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
    let nonce: TsonNonce = '' as TsonNonce;
    const encoded = JSON.parse(str, function (_key, value: unknown) {
      if (!nonce) {
        // first value is always the nonce
        nonce = value as TsonNonce;
        return value;
      }
      if (isTsonTuple(value, nonce)) {
        const [type, serializedValue] = value;
        console.log({ value });
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && Object.prototype.toString.call(value) === '[object Object]';
}
function isWalkable(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return !!value && typeof value === 'object';
}

export function tsonEncoder(opts: TsonOptions) {
  const handlers = getHandlers(opts);
  const maybeNonce = opts.nonce;

  function walker(nonce: TsonNonce, value: unknown): unknown {
    const vType = typeof value;

    console.log('type', vType, value);

    const primitiveHandler = handlers.primitive[vType];
    if (primitiveHandler) {
      if (!primitiveHandler.test || primitiveHandler.test(value)) {
        return primitiveHandler.$encode(value, nonce, (inner) => {
          return isWalkable(inner) ? walker(nonce, inner) : inner;
        });
      }
    }

    for (const handler of handlers.custom) {
      if (handler.test(value)) {
        return handler.$encode(value, nonce, (inner) => {
          return isWalkable(inner) ? walker(nonce, inner) : inner;
        });
      }
    }

    if (Array.isArray(value)) {
      return value.map((value) => {
        return walker(nonce, value);
      });
    }

    if (isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value)) {
        result[key] = walker(nonce, inner);
      }
      return result;
    }

    return value;
  }
  return function parse(obj: unknown): TsonSerialized {
    const nonce = getNonce(maybeNonce);

    const tson = walker(nonce, obj);

    return [tson, nonce];
  };
}
