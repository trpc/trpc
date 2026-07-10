/** @internal */
export type UnsetMarker = 'unsetMarker' & {
  __brand: 'unsetMarker';
};

/**
 * Ensures there are no duplicate keys when building a procedure.
 * @internal
 */
export function mergeWithoutOverrides<TType extends Record<string, unknown>>(
  obj1: TType,
  ...objs: Partial<TType>[]
): TType {
  const newObj: TType = Object.assign(emptyObject(), obj1);

  for (const overrides of objs) {
    for (const key in overrides) {
      if (key in newObj && newObj[key] !== overrides[key]) {
        throw new Error(`Duplicate key ${key}`);
      }
      newObj[key as keyof TType] = overrides[key] as TType[keyof TType];
    }
  }
  return newObj;
}

/**
 * Check that value is object
 * @internal
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && !Array.isArray(value) && typeof value === 'object';
}

type AnyFn = ((...args: any[]) => unknown) & Record<keyof any, unknown>;
export function isFunction(fn: unknown): fn is AnyFn {
  return typeof fn === 'function';
}

/**
 * Create an object without inheriting anything from `Object.prototype`
 * @internal
 */
export function emptyObject<TObj extends Record<string, unknown>>(): TObj {
  return Object.create(null);
}

const asyncIteratorsSupported =
  typeof Symbol === 'function' && !!Symbol.asyncIterator;

export function isAsyncIterable<TValue>(
  value: unknown,
): value is AsyncIterable<TValue> {
  return (
    asyncIteratorsSupported && isObject(value) && Symbol.asyncIterator in value
  );
}

/**
 * Run an IIFE
 */
export const run = <TValue>(fn: () => TValue): TValue => fn();

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function noop(): void {}

export function identity<T>(it: T): T {
  return it;
}

/**
 * Generic runtime assertion function. Throws, if the condition is not `true`.
 *
 * Can be used as a slightly less dangerous variant of type assertions. Code
 * mistakes would be revealed at runtime then (hopefully during testing).
 */
export function assert(
  condition: boolean,
  msg = 'no additional info',
): asserts condition {
  if (!condition) {
    throw new Error(`AssertionError: ${msg}`);
  }
}

export function sleep(ms = 0): Promise<void> {
  return new Promise<void>((res) => setTimeout(res, ms));
}

/**
 * Ponyfill for
 * [`AbortSignal.any`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static).
 */
export function abortSignalsAnyPonyfill(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }

  const ac = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      trigger();
      break;
    }
    signal.addEventListener('abort', trigger, { once: true });
  }

  return ac.signal;

  function trigger() {
    ac.abort();
    for (const signal of signals) {
      signal.removeEventListener('abort', trigger);
    }
  }
}
