// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  announcement,
  announcementScript,
  dismissAnnouncement,
  hiddenAttribute,
} from './announcement.ts';

const hidden = () => document.documentElement.hasAttribute(hiddenAttribute);
// oxlint-disable-next-line typescript/no-implied-eval -- runs the script as the page's <head> does
const runScript = () => new Function(announcementScript)();
const until = Date.parse(announcement.until);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(hiddenAttribute);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('announcementScript', () => {
  it('shows the bar until it expires', () => {
    vi.useFakeTimers({ now: until - 1 });
    runScript();
    expect(hidden()).toBe(false);
  });

  it('hides the bar once it expires, even on a page cached before', () => {
    vi.useFakeTimers({ now: until });
    runScript();
    expect(hidden()).toBe(true);
  });

  it('hides a dismissed bar on later pages', () => {
    vi.useFakeTimers({ now: until - 1 });
    dismissAnnouncement();
    expect(hidden()).toBe(true);
    document.documentElement.removeAttribute(hiddenAttribute);
    runScript();
    expect(hidden()).toBe(true);
  });

  it('shows a new announcement to readers who dismissed the last one', () => {
    vi.useFakeTimers({ now: until - 1 });
    localStorage.setItem('trpc-docs:announcement-dismissed', 'an-older-one');
    runScript();
    expect(hidden()).toBe(false);
  });

  it('shows the bar when storage is blocked', () => {
    vi.useFakeTimers({ now: until - 1 });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    runScript();
    expect(hidden()).toBe(false);
  });
});
