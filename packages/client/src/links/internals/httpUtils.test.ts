import { getUrl, resolveHTTPLinkOptions } from './httpUtils';

const endpoint = 'https://example.com/trpc?redirect=/app?tab=profile&keep=yes';

describe('getUrl', () => {
  test('keeps an endpoint query value that contains a question mark', () => {
    const url = new URL(
      getUrl({
        ...resolveHTTPLinkOptions({ url: endpoint }),
        type: 'query',
        path: 'post.byId',
        input: { id: 1 },
        signal: null,
      }),
    );

    expect(url.pathname).toBe('/trpc/post.byId');
    expect(url.searchParams.get('redirect')).toBe('/app?tab=profile');
    expect(url.searchParams.get('keep')).toBe('yes');
    expect(url.searchParams.get('input')).toBe('{"id":1}');
  });

  test('keeps it for a batch too', () => {
    const url = new URL(
      getUrl({
        ...resolveHTTPLinkOptions({ url: new URL(endpoint) }),
        type: 'query',
        path: 'post.byId,post.byId',
        inputs: [{ id: 1 }, { id: 2 }],
        signal: null,
      }),
    );

    expect(url.searchParams.get('redirect')).toBe('/app?tab=profile');
    expect(url.searchParams.get('keep')).toBe('yes');
    expect(url.searchParams.get('batch')).toBe('1');
  });

  test('drops an endpoint fragment so the input still reaches the server', () => {
    const url = new URL(
      getUrl({
        ...resolveHTTPLinkOptions({ url: `${endpoint}#top` }),
        type: 'query',
        path: 'post.byId,post.byId',
        inputs: [{ id: 1 }, { id: 2 }],
        signal: null,
      }),
    );

    expect(url.hash).toBe('');
    expect(url.pathname).toBe('/trpc/post.byId,post.byId');
    expect(url.searchParams.get('redirect')).toBe('/app?tab=profile');
    expect(url.searchParams.get('keep')).toBe('yes');
    expect(url.searchParams.get('batch')).toBe('1');
    expect(url.searchParams.get('input')).toBe('{"0":{"id":1},"1":{"id":2}}');
  });
});
