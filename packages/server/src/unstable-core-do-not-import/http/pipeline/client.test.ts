import { pipelinedBatchUrl } from './client';

describe('pipelinedBatchUrl', () => {
  const pipe = { 1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] } };

  test('a link URL with a `pipe` of its own is refused, as the pipelined GET adds one', () => {
    expect(() =>
      pipelinedBatchUrl({ url: 'http://x/a,b?pipe=1&batch=1', pipe }),
    ).toThrow('"pipe" is reserved for pipelining');
    expect(() =>
      pipelinedBatchUrl({
        url: 'http://x/a,b?token=t&pipe=&batch=1&input=%7B%7D',
        pipe,
      }),
    ).toThrow('"pipe" is reserved for pipelining');
  });

  test('a link URL with a `pipe` of its own is refused for a POST too, which has its `pipe` in the body', () => {
    expect(() =>
      pipelinedBatchUrl({ url: 'http://x/a,b?pipe=1&batch=1', pipe: null }),
    ).toThrow('"pipe" is reserved for pipelining');
  });

  test('a search param that only looks like `pipe` is left alone', () => {
    expect(
      pipelinedBatchUrl({ url: 'http://x/a,b?pipeline=1&batch=1', pipe }),
    ).toBe(
      `http://x/a,b?pipeline=1&batch=pipeline&pipe=${encodeURIComponent(
        JSON.stringify(pipe),
      )}`,
    );
  });
});
