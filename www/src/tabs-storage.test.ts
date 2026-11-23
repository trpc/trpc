// @vitest-environment jsdom
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { describe, expect, it, vi } from 'vitest';

import { savedTab, saveTab } from './tabs.ts';

/** Empty localStorage and no tab cookie, with mocks restored when disposed. */
function cleanStorage() {
  localStorage.clear();
  document.cookie = 'trpc-docs-tab-framework=; Max-Age=0; Path=/';
  return makeResource({}, () => vi.restoreAllMocks());
}

describe('saveTab', () => {
  it('keeps the pick in localStorage and a cookie', () => {
    using _storage = cleanStorage();
    saveTab('framework', 'TanStack Start');
    expect(localStorage.getItem('trpc-docs:tab:framework')).toBe(
      'TanStack Start',
    );
    expect(document.cookie).toContain(
      'trpc-docs-tab-framework=TanStack%20Start',
    );
    expect(savedTab('framework')).toBe('TanStack Start');
  });

  it('reads the cookie when localStorage is blocked', () => {
    using _storage = cleanStorage();
    saveTab('framework', 'Next.js');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(savedTab('framework')).toBe('Next.js');
  });

  it('has nothing saved before a pick', () => {
    using _storage = cleanStorage();
    expect(savedTab('framework')).toBeNull();
  });
});
