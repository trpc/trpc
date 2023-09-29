import { isPlainObject } from './isPlainObject';
import { TsonTypeHandler } from './types';

export const MapHandler: TsonTypeHandler<
  Map<unknown, unknown>,
  [unknown, unknown][]
> = {
  test(v) {
    return v instanceof Map;
  },
  encode(v) {
    return Array.from(v.entries());
  },
  decode(v) {
    return new Map(v);
  },
};

export const SetHandler: TsonTypeHandler<Set<unknown>, unknown[]> = {
  test(v) {
    return v instanceof Set;
  },
  encode(v) {
    return Array.from(v);
  },
  decode(v) {
    return new Set(v);
  },
};
export const bigintHandler: TsonTypeHandler<bigint, string> = {
  primitive: 'bigint',
  decode(v) {
    return BigInt(v);
  },
  encode(v) {
    return v.toString();
  },
};
export const numberHandler: TsonTypeHandler<number, number> = {
  primitive: 'number',
  transform: false,
  test(v) {
    if (isNaN(v as number)) {
      throw new Error('NaN is not supported');
    }
    return true;
  },
};

export const undefinedHandler: TsonTypeHandler<undefined, 0> = {
  primitive: 'undefined',
  encode() {
    return 0;
  },
  decode() {
    return undefined;
  },
};

export const DateHandler: TsonTypeHandler<Date, string> = {
  encode(value) {
    return value.toJSON();
  },
  decode(value) {
    return new Date(value);
  },
  test(value) {
    return value instanceof Date;
  },
};

export class UnknownObjectGuardError extends Error {
  /**
   * The bad object that was found
   */
  public readonly value;

  constructor(value: unknown) {
    super(`Unknown object found`);

    this.name = this.constructor.name;
    this.value = value;
  }
}
/**
 * This is a guard that will throw an error if a non-plain object is found which isn't handled.
 * @remark Make sure to define this last in the record of guards.
 * @throws {UnknownObjectGuardError} If a non-plain object is found.
 */
export const unknownObjectGuard: TsonTypeHandler<unknown, never> = {
  transform: false,
  test(v) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !isPlainObject(v)) {
      throw new UnknownObjectGuardError(v);
    }
    return false;
  },
};

export const RegExpHandler: TsonTypeHandler<RegExp, string> = {
  test(value) {
    return value instanceof RegExp;
  },
  encode(value) {
    return '' + value;
  },
  decode(str) {
    const body = str.slice(1, str.lastIndexOf('/'));
    const flags = str.slice(str.lastIndexOf('/') + 1);
    return new RegExp(body, flags);
  },
};
