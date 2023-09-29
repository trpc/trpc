import { TsonOptions, TsonTypeHandler } from './types';

type UnknownMap = Map<unknown, unknown>;
export const MapHandler: TsonTypeHandler<UnknownMap> = {
  test(v) {
    return v instanceof Map;
  },
  encode(v) {
    return Array.from(v.entries());
  },
  decode(v) {
    return new Map(v as any[]);
  },
};

export const SetHandler: TsonTypeHandler<Set<unknown>> = {
  test(v) {
    return v instanceof Set;
  },
  encode(v) {
    return Array.from(v);
  },
  decode(v) {
    return new Set(v as any[]);
  },
};
export const bigintHandler: TsonTypeHandler<bigint> = {
  primitive: 'bigint',
  decode(v) {
    return BigInt(v as string);
  },
  encode(v) {
    return v.toString();
  },
};
export const numberHandler: TsonTypeHandler<number> = {
  primitive: 'number',
  transform: false,
  test(v) {
    if (isNaN(v as number)) {
      throw new Error('NaN is not supported');
    }
    return true;
  },
};

export const undefinedHandler: TsonTypeHandler<undefined> = {
  primitive: 'undefined',
  encode() {
    return 0;
  },
  decode() {
    return undefined;
  },
};
export const defaultHandler = {
  Map: MapHandler,
  bigint: bigintHandler,
  numberHandler,
} satisfies TsonOptions['types'];
