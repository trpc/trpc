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

type WalkFn = (value: unknown) => unknown;
type WalkerFactory = (nonce: TsonNonce) => WalkFn;

export function tsonDecoder(opts: TsonOptions) {
  const walker: WalkerFactory = (nonce) => {
    const walk: WalkFn = (value) => {
      if (isTsonTuple(value, nonce)) {
        const [type, serializedValue] = value;
        const transformer = opts.types[type] as TsonTransformerEncodeDecode<
          any,
          any
        >;
        return transformer.decode(walk(serializedValue));
      }

      if (isPlainObjectOrArray(value)) {
        return map(value, walk);
      }

      return value;
    };
    return walk;
  };

  return (obj: TsonEncoded) => walker(obj.nonce)(obj.json);
}

export function tsonParser(opts: TsonOptions) {
  const decoder = tsonDecoder(opts);

  return (str: string) => decoder(JSON.parse(str) as TsonEncoded);
}

export function tsonStringifier(opts: TsonOptions) {
  const encoder = tsonEncoder(opts);

  return (obj: unknown, space?: string | number) =>
    JSON.stringify(encoder(obj), null, space);
}

function createEncoders(opts: TsonOptions) {
  // warmup the type handlers
  const types = Object.entries(opts.types).map(([_key, handler]) => {
    const key = _key as TsonTypeHandlerKey;
    const encode = handler.encode;

    type Encoder = (
      value: unknown,
      nonce: TsonNonce,
      walk: WalkFn,
    ) => TsonEncodedValue;

    const $encode: Encoder = encode
      ? (value, nonce, walk): TsonTuple => [key, walk(encode(value)), nonce]
      : (value, _nonce, walk) => walk(value);
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

  const walker: WalkerFactory = (nonce) => {
    const walk: WalkFn = (value) => {
      const type = typeof value;

      const primitiveHandler = handlers.primitive[type];
      if (primitiveHandler) {
        if (!primitiveHandler.test || primitiveHandler.test(value)) {
          return primitiveHandler.$encode(value, nonce, walk);
        }
      }
      for (const handler of handlers.custom) {
        if (handler.test(value)) {
          return handler.$encode(value, nonce, walk);
        }
      }

      if (isPlainObjectOrArray(value)) {
        return map(value, walk);
      }

      return value;
    };

    return walk;
  };
  return function parse(obj: unknown): TsonEncoded {
    const nonce: TsonNonce =
      typeof maybeNonce === 'function'
        ? (maybeNonce() as TsonNonce)
        : ('__tson' as TsonNonce);

    const json = walker(nonce)(obj);

    return {
      nonce,
      json,
    };
  };
}
