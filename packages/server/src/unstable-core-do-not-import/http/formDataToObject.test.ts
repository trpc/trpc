import { formDataToObject } from './formDataToObject';

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
});
