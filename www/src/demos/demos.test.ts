import { describe, expect, it } from 'vitest';

import { progress, timeline } from './timeline.ts';
import {
  formatInput,
  lastPage,
  listPosts,
  listUrl,
  parseListUrl,
} from './url-state.ts';

describe('timeline', () => {
  it('starts the comments after the post with fetch-on-render', () => {
    const plan = timeline('fetch-on-render', 200);
    expect(
      plan.requests.map((request) => [request.start, request.end]),
    ).toEqual([
      [0, 200],
      [200, 400],
    ]);
    expect(plan.readyAt).toBe(400);
  });

  it('starts both at once with render-as-you-fetch', () => {
    const plan = timeline('render-as-you-fetch', 100);
    expect(
      plan.requests.map((request) => [request.start, request.end]),
    ).toEqual([
      [0, 100],
      [0, 100],
    ]);
    expect(plan.readyAt).toBe(100);
  });

  it('measures progress from 0 to 1', () => {
    const request = { end: 400, label: 'x', start: 200 };
    expect(
      [0, 200, 300, 400, 500].map((time) => progress(request, time)),
    ).toEqual([0, 0, 0.5, 1, 1]);
  });
});

describe('url state', () => {
  it('reads the sort and page from the URL', () => {
    expect(parseListUrl('/posts?sort=top&page=3')).toEqual({
      page: 3,
      sort: 'top',
    });
  });

  it('falls back to the defaults for missing or invalid params', () => {
    expect(parseListUrl('/posts')).toEqual({ page: 1, sort: 'new' });
    expect(parseListUrl('/posts?sort=old&page=0')).toEqual({
      page: 1,
      sort: 'new',
    });
    expect(parseListUrl(`/posts?page=${lastPage + 1}`).page).toBe(1);
    expect(parseListUrl('  ')).toEqual({ page: 1, sort: 'new' });
    expect(parseListUrl('http://')).toEqual({ page: 1, sort: 'new' });
  });

  it('round-trips through listUrl', () => {
    const input = { page: 2, sort: 'top' } as const;
    expect(parseListUrl(listUrl(input))).toEqual(input);
    expect(listUrl({ page: 2 })).toBe('/posts?page=2');
  });

  it('writes inputs the way the call would', () => {
    expect(formatInput({ page: 2, sort: 'top' })).toBe(
      "{ sort: 'top', page: 2 }",
    );
    expect(formatInput({ page: 1 })).toBe('{ page: 1 }');
  });

  it('orders the posts by the sort, three a page', () => {
    const top = listPosts({ page: 1, sort: 'top' });
    expect(top).toHaveLength(3);
    expect(top.map((post) => post.votes)).toEqual(
      top.map((post) => post.votes).toSorted((a, b) => b - a),
    );
    expect(listPosts({ page: 1, sort: 'new' })).not.toEqual(top);
    expect(listPosts({ page: lastPage, sort: 'new' })).toHaveLength(3);
  });
});
