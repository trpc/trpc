import { router } from '../src/router';

test('double errors', async () => {
  expect(() => {
    router()
      .query('dupe', {
        resolve() {
          return null;
        },
      })
      .query('dupe', {
        resolve() {
          return null;
        },
      });
  }).toThrowErrorMatchingInlineSnapshot(`"Duplicate endpoint(s): dupe"`);
});
