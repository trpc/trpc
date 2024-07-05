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
