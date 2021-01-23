/* eslint-disable @typescript-eslint/ban-types */
import { router } from '../src';

test('types', async () => {
  const r = router<{}>().queries({
    test: () => {
      return {
        hello: 'test',
      };
    },
  });
  expect(true).toBe(true);

  {
    const res = await r.invokeQuery({})('test');

    expect(res.hello).toBe('test');
  }
  {
    const res: {
      hello: string;
    } = await r.invokeQuery({})('test');
    expect(res.hello).toBe('test');
  }
});
