import { makeResource } from '../stream/utils/disposable';
import { formDataToObject } from './formDataToObject';

/**
 * Restores `keys` on the built-in prototypes when disposed, so a failing
 * pollution test doesn't leak into other tests.
 */
function builtinPrototypesResource(keys: string[]) {
  const saved = [String.prototype, Number.prototype, Object.prototype].flatMap(
    (proto) =>
      keys.map((key) => ({
        proto,
        key,
        descriptor: Object.getOwnPropertyDescriptor(proto, key),
      })),
  );
  return makeResource({}, () => {
    for (const { proto, key, descriptor } of saved) {
      if (descriptor) {
        Object.defineProperty(proto, key, descriptor);
      } else {
        delete (proto as Record<string, unknown>)[key];
      }
    }
  });
}

test('basic', () => {
  const formData = new FormData();

  formData.append('foo', 'bar');

  expect(formDataToObject(formData)).toEqual({
    foo: 'bar',
  });
});

test('multiple values on the same key', () => {
  const formData = new FormData();

  formData.append('foo', 'bar');
  formData.append('foo', 'baz');

  expect(formDataToObject(formData)).toEqual({
    foo: ['bar', 'baz'],
  });
});

test('deep key', () => {
  const formData = new FormData();

  formData.append('foo.bar.baz', 'qux');
  formData.append('foo.bar.boo', 'boo');
  formData.append('foo.bar.0', 'boo');

  expect(formDataToObject(formData)).toEqual({
    foo: {
      bar: {
        baz: 'qux',
        boo: 'boo',
        0: 'boo',
      },
    },
  });
});

test('array', () => {
  const formData = new FormData();

  formData.append('foo[0]', 'bar');
  formData.append('foo[1]', 'baz');

  expect(formDataToObject(formData)).toEqual({
    foo: ['bar', 'baz'],
  });
});

test('array with dot notation', () => {
  const formData = new FormData();

  formData.append('foo.0', 'bar');
  formData.append('foo.1', 'baz');

  expect(formDataToObject(formData)).toEqual({
    foo: ['bar', 'baz'],
  });
});

test('array-like index in an object', () => {
  const formData = new FormData();

  formData.append('foo.0', '0');
  formData.append('foo.a', 'a');

  expect(formDataToObject(formData)).toEqual({
    foo: {
      0: '0',
      a: 'a',
    },
  });
});

describe('prototype pollution', () => {
  test('__proto__ key creates regular property', () => {
    const formData = new FormData();

    formData.append('__proto__.pollution', 'yes');
    const result: any = formDataToObject(formData);

    expect(result.__proto__.pollution).toBe('yes');
  });

  test('global prototype chain is not polluted', () => {
    const formData = new FormData();

    formData.append(`__proto__.pollution`, 'yes');

    formDataToObject(formData);
    expect((Object.prototype as any).pollution).toBeUndefined();
  });

  test('deep prototype pollution', () => {
    const formData = new FormData();

    formData.append(`one.__proto__.pollution`, 'yes');
    const result: any = formDataToObject(formData);

    expect(result.one.__proto__.pollution).toBe('yes');
    expect((Object.prototype as any).pollution).toBeUndefined();
  });

  test('deep array pollution', () => {
    const formData = new FormData();

    formData.append(`0.__proto__.pollution`, 'yes');
    const result: any = formDataToObject(formData);

    expect(result[0].__proto__.pollution).toBe('yes');
    expect((Object.prototype as any).pollution).toBeUndefined();
    expect((Array.prototype as any).pollution).toBeUndefined();
  });

  describe('through a value an earlier field already set', () => {
    test.each([
      {
        name: 'a string',
        entries: [
          ['a', 'x'],
          ['a[__proto__][polluted]', 'yes'],
        ],
        read: () => ('' as any).polluted,
      },
      {
        name: "a string's length",
        entries: [
          ['n', 'x'],
          ['n[length][__proto__][polluted]', 'yes'],
        ],
        read: () => (5 as any).polluted,
      },
      {
        name: 'an array element',
        entries: [
          ['a[0]', 'x'],
          ['a[0][__proto__][polluted]', 'yes'],
        ],
        read: () => ('' as any).polluted,
      },
    ])('$name does not reach a built-in prototype', (opts) => {
      using _prototypes = builtinPrototypesResource(['polluted']);
      const formData = new FormData();
      for (const [key, value] of opts.entries) {
        formData.append(key!, value!);
      }

      expect(() => formDataToObject(formData)).toThrow(TypeError);
      expect(opts.read()).toBeUndefined();
    });

    test('a built-in method is not replaced', () => {
      using _prototypes = builtinPrototypesResource(['trim']);
      const formData = new FormData();
      formData.append('a', 'x');
      formData.append('a[__proto__][trim]', 'y');

      expect(() => formDataToObject(formData)).toThrow(TypeError);
      expect(' x '.trim()).toBe('x');
    });
  });

  test('an array turned into an object keeps a null prototype', () => {
    const formData = new FormData();

    formData.append('a[0]', 'x');
    formData.append('a[__proto__][pollution]', 'yes');
    const result: any = formDataToObject(formData);

    expect(Object.getPrototypeOf(result.a)).toBeNull();
    expect(result.a[0]).toBe('x');
    expect(result.a.__proto__.pollution).toBe('yes');
    expect((Object.prototype as any).pollution).toBeUndefined();
  });
});
