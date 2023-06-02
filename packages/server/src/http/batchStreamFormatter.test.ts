import { getBatchStreamFormatter } from './batchStreamFormatter';

test('getBatchStreamFormatter', () => {
  const formatter = getBatchStreamFormatter();
  expect(formatter(1, '{"foo": "bar"}')).toBe(`{"1":{"foo": "bar"}\n`);
  expect(formatter(0, '{"q": "a"}')).toBe(`,"0":{"q": "a"}\n`);
  expect(formatter(2, '{"hello": "world"}')).toBe(`,"2":{"hello": "world"}\n`);
  expect(formatter.end()).toBe('}');
});
