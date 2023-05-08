import { getPostBody } from '@trpc/server/src/adapters/node-http/content-decoder/json/getPostBody';

test('POST w/o specifying content-type should work', async () => {
  {
    const req = {
      body: '',
      headers: {
        'content-type': 'application/json',
      },
    } as any;
    const result = await getPostBody({
      req,
    });
    assert(result.ok);
    expect(result.preprocessed).toBe(true);
  }

  {
    const req = {
      body: '',
      headers: {},
    } as any;
    const result = await getPostBody({
      req,
    });
    assert(result.ok);
    expect(result.preprocessed).toBe(false);
  }
});
