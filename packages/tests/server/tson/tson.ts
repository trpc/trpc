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
import { walker } from './walker';

function isTsonTuple(v: unknown, nonce: string): v is TsonTuple {
  return Array.isArray(v) && v.length === 3 && v[2] === nonce;
}

function getHandlers(opts: TsonOptions) {
  // warmup the type handlers
  const types = Object.entries(opts.types).map(([_key, handler]) => {
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

export function tsonDecoder(opts: TsonOptions) {
  return function decode(obj: TsonSerialized) {
    const nonce = obj.nonce;
    const result = walker(obj.json, (node, innerWalk) => {
      if (isTsonTuple(node, nonce)) {
        const [type, serializedValue] = node;
        const transformer = opts.types[
          type
        ] as TsonTransformerEncodeDecode<unknown>;

        const innerValue = innerWalk(serializedValue);

        return [transformer.decode(innerValue)];
      }
      return null;
    });
    return result;
  };
}

export function tsonParser(opts: TsonOptions) {
  const decoder = tsonDecoder(opts);
  return function parse(str: string) {
    const parsed = JSON.parse(str) as TsonSerialized;

    return decoder(parsed);
  };
}

export function tsonStringifier(opts: TsonOptions) {
  const encoder = tsonEncoder(opts);

  return function stringify(obj: unknown, space?: string | number) {
    return JSON.stringify(encoder(obj), null, space);
  };
}

export function tsonEncoder(opts: TsonOptions) {
  const handlers = getHandlers(opts);
  const maybeNonce = opts.nonce;

  return function parse(obj: unknown): TsonSerialized {
    const nonce = getNonce(maybeNonce);

    const json = walker(obj, (value, innerWalk) => {
      const vType = typeof value;

      const primitiveHandler = handlers.primitive[vType];
      if (primitiveHandler) {
        if (!primitiveHandler.test || primitiveHandler.test(value)) {
          return [primitiveHandler.$encode(value, nonce, innerWalk)];
        }
      }
      for (const handler of handlers.custom) {
        if (handler.test(value)) {
          return [handler.$encode(value, nonce, innerWalk)];
        }
      }

      return null;
    });

    return {
      nonce,
      json,
    };
  };
}
