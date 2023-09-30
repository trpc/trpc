import {
  TsonAllTypes,
  TsonEncoded,
  TsonEncodedValue,
  TsonNonce,
  TsonOptions,
  TsonTransformerEncodeDecode,
  TsonTuple,
  TsonTypeHandlerKey,
  TsonTypeTesterCustom,
  TsonTypeTesterPrimitive,
} from './types';
import { isPlainObjectOrArray, map } from './utils';

function isTsonTuple(v: unknown, nonce: string): v is TsonTuple {
  return Array.isArray(v) && v.length === 3 && v[2] === nonce;
}

type WalkerFactory = (nonce: TsonNonce) => (value: unknown) => unknown;

export function tsonDecoder(opts: TsonOptions) {
  const walk: WalkerFactory = (nonce) => (value) => {
    if (isTsonTuple(value, nonce)) {
      const [type, serializedValue] = value;
      const transformer = opts.types[type] as TsonTransformerEncodeDecode<
        any,
        any
      >;
      return transformer.decode(walk(nonce)(serializedValue));
    }

    if (isPlainObjectOrArray(value)) {
      return map(value, (val) => {
        return walk(nonce)(val);
      });
    }

    return value;
  };
  return function decode(obj: TsonEncoded) {
    const nonce = obj.nonce;
    const result = walk(nonce)(obj.json);
    return result;
  };
}

export function tsonParser(opts: TsonOptions) {
  const decoder = tsonDecoder(opts);
  return function parse(str: string) {
    const parsed = JSON.parse(str) as TsonEncoded;

    return decoder(parsed);
  };
}

export function tsonStringifier(opts: TsonOptions) {
  const encoder = tsonEncoder(opts);

  return function stringify(obj: unknown, space?: string | number) {
    return JSON.stringify(encoder(obj), null, space);
  };
}

function createEncoders(opts: TsonOptions) {
  // warmup the type handlers
  const types = Object.entries(opts.types).map(([_key, handler]) => {
    const key = _key as TsonTypeHandlerKey;
    const encode = handler.encode;

    type Encoder = (
      value: unknown,
      nonce: TsonNonce,
      walk: ReturnType<WalkerFactory>,
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
export function tsonEncoder(opts: TsonOptions) {
  const handlers = createEncoders(opts);
  const maybeNonce = opts.nonce;

  const walk: WalkerFactory = (nonce) => (value) => {
    const type = typeof value;

    const primitiveHandler = handlers.primitive[type];
    if (primitiveHandler) {
      if (!primitiveHandler.test || primitiveHandler.test(value)) {
        return primitiveHandler.$encode(value, nonce, walk(nonce));
      }
    }
    for (const handler of handlers.custom) {
      if (handler.test(value)) {
        return handler.$encode(value, nonce, walk(nonce));
      }
    }

    if (isPlainObjectOrArray(value)) {
      return map(value, (val) => {
        return walk(nonce)(val);
      });
    }

    return value;
  };
  return function parse(obj: unknown): TsonEncoded {
    const nonce: TsonNonce =
      typeof maybeNonce === 'function'
        ? (maybeNonce() as TsonNonce)
        : ('__tson' as TsonNonce);

    const json = walk(nonce)(obj);

    return {
      nonce,
      json,
    };
  };
}
