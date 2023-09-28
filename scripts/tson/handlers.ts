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
export const defaults = {
  Map: MapHandler,
  bigint: bigintHandler,
  numberHandler,
} satisfies TsonOptions['types'];
