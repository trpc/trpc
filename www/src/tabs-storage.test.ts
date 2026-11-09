// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { savedTab, saveTab } from './tabs.ts';

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'trpc-docs-tab-framework=; Max-Age=0; Path=/';
  vi.restoreAllMocks();
});

describe('saveTab', () => {
  it('keeps the pick in localStorage and a cookie', () => {
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
    saveTab('framework', 'Next.js');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(savedTab('framework')).toBe('Next.js');
  });

  it('has nothing saved before a pick', () => {
    expect(savedTab('framework')).toBeNull();
  });
});
