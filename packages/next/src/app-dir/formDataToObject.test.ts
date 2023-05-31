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

  expect(formDataToObject(formData)).toEqual({
    foo: {
      bar: {
        baz: 'qux',
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
