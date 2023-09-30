import {
  TsonAllTypes,
  TsonNonce,
  TsonOptions,
  TsonSerialized,
  TsonSerializedValue,
  TsonTransformerSerializeDeserialize,
  TsonTuple,
  TsonTypeHandlerKey,
  TsonTypeTesterCustom,
  TsonTypeTesterPrimitive,
} from './types';
import { isPlainObject } from './utils';

function isTsonTuple(v: unknown, nonce: string): v is TsonTuple {
  return Array.isArray(v) && v.length === 3 && v[2] === nonce;
}

type WalkFn = (value: unknown) => unknown;
type WalkerFactory = (nonce: TsonNonce) => WalkFn;

export function tsonDeserializer(opts: TsonOptions) {
  const walker: WalkerFactory = (nonce) => {
    const walk: WalkFn = (value) => {
      if (isTsonTuple(value, nonce)) {
        const [type, serializedValue] = value;
        const transformer = opts.types[
          type
        ] as TsonTransformerSerializeDeserialize<any, any>;
        return transformer.deserialize(walk(serializedValue));
      }

      return mapOrReturn(value, walk);
    };
    return walk;
  };

  return (obj: TsonSerialized) => walker(obj.nonce)(obj.json);
}

export function tsonParser(opts: TsonOptions) {
  const deserializer = tsonDeserializer(opts);

  return (str: string) => deserializer(JSON.parse(str) as TsonSerialized);
}

export function tsonStringifier(opts: TsonOptions) {
  const serializer = tsonSerializer(opts);

  return (obj: unknown, space?: string | number) =>
    JSON.stringify(serializer(obj), null, space);
}

function createSerializers(opts: TsonOptions) {
  // warmup the type handlers
  const types = Object.entries(opts.types).map(([_key, handler]) => {
    const key = _key as TsonTypeHandlerKey;
    const serialize = handler.serialize;

    type Serializer = (
      value: unknown,
      nonce: TsonNonce,
      walk: WalkFn,
    ) => TsonSerializedValue;

    const $serialize: Serializer = serialize
      ? (value, nonce, walk): TsonTuple => [key, walk(serialize(value)), nonce]
      : (value, _nonce, walk) => walk(value);
    return {
      ...handler,
      $serialize,
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
export function tsonSerializer(opts: TsonOptions) {
  const handlers = createSerializers(opts);
  const maybeNonce = opts.nonce;

  const walker: WalkerFactory = (nonce) => {
    const walk: WalkFn = (value) => {
      const type = typeof value;

      const primitiveHandler = handlers.primitive[type];
      if (
        primitiveHandler &&
        (!primitiveHandler.test || primitiveHandler.test(value))
      ) {
        return primitiveHandler.$serialize(value, nonce, walk);
      }
      for (const handler of handlers.custom) {
        if (handler.test(value)) {
          return handler.$serialize(value, nonce, walk);
        }
      }

      return mapOrReturn(value, walk);
    };

    return walk;
  };
  return (obj: unknown): TsonSerialized => {
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

/**
 * Maps over an object or array, returning a new object or array with the same keys.
 * If the input is not an object or array, the input is returned.
 */
export function mapOrReturn(
  input: unknown,
  fn: (val: unknown, key: number | string) => unknown,
): unknown {
  if (Array.isArray(input)) {
    return input.map(fn);
  }
  if (isPlainObject(input)) {
    const output: typeof input = {};
    for (const [key, value] of Object.entries(input)) {
      output[key] = fn(value, key);
    }
    return output;
  }
  return input;
}
