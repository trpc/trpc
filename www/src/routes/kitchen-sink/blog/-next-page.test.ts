import { describe, expect, it } from 'vitest';

import { loadsNextPageOnScroll } from './-next-page.ts';

describe('loading the next page on scroll', () => {
  it('stops after the next page failed, until "Try again"', () => {
    const page = {
      hasNextPage: true,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
    };
    expect(loadsNextPageOnScroll(page)).toBe(true);
    expect(loadsNextPageOnScroll({ ...page, isFetchNextPageError: true })).toBe(
      false,
    );
    expect(loadsNextPageOnScroll({ ...page, isFetchingNextPage: true })).toBe(
      false,
    );
    expect(loadsNextPageOnScroll({ ...page, hasNextPage: false })).toBe(false);
  });
});
