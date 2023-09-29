import { isPlainObject } from './isPlainObject';
import { TsonTypeHandler } from './types';

export const MapHandler: TsonTypeHandler<
  Map<unknown, unknown>,
  [unknown, unknown][]
> = {
  test: (v) => v instanceof Map,
  encode: (v) => Array.from(v.entries()),
  decode: (v) => new Map(v),
};

export const SetHandler: TsonTypeHandler<Set<unknown>, unknown[]> = {
  test: (v) => v instanceof Set,
  encode: (v) => Array.from(v),
  decode: (v) => new Set(v),
};

export const bigintHandler: TsonTypeHandler<bigint, string> = {
  primitive: 'bigint',
  decode: (v) => BigInt(v),
  encode: (v) => v.toString(),
};

export const numberHandler: TsonTypeHandler<number, number> = {
  primitive: 'number',
  transform: false,
  test: (v) => {
    if (isNaN(v as number)) throw new Error('NaN is not supported');
    return true;
  },
};

export const undefinedHandler: TsonTypeHandler<undefined, 0> = {
  primitive: 'undefined',
  encode: () => 0,
  decode: () => undefined,
};

export const DateHandler: TsonTypeHandler<Date, string> = {
  encode: (value) => value.toJSON(),
  decode: (value) => new Date(value),
  test: (value) => value instanceof Date,
};

export class UnknownObjectGuardError extends Error {
  public readonly value;

  constructor(value: unknown) {
    super(`Unknown object found`);
    this.name = this.constructor.name;
    this.value = value;
  }
}

export const unknownObjectGuard: TsonTypeHandler<unknown, never> = {
  transform: false,
  test: (v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && !isPlainObject(v)) {
      throw new UnknownObjectGuardError(v);
    }
    return false;
  },
};

export const RegExpHandler: TsonTypeHandler<RegExp, string> = {
  test: (value) => value instanceof RegExp,
  encode: (value) => '' + value,
  decode: (str) => {
    const body = str.slice(1, str.lastIndexOf('/'));
    const flags = str.slice(str.lastIndexOf('/') + 1);
    return new RegExp(body, flags);
  },
};
