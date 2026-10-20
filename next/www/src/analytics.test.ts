import { describe, expect, it } from '@effect/vitest';

import {
  analyticsOn,
  type GtagWindow,
  installGtag,
  measurementId,
  pageViews,
} from './analytics.ts';

describe('analyticsOn', () => {
  it("counts trpc.io's production deployment, at trpc.io only", () => {
    expect(analyticsOn('https://trpc.io', 'production', 'trpc.io')).toBe(true);
    expect(
      analyticsOn('https://trpc.io', 'production', 'trpc-v12.vercel.app'),
    ).toBe(false);
    expect(analyticsOn('https://trpc.io', 'production', 'localhost')).toBe(
      false,
    );
  });

  it("doesn't count previews, local builds or v12.trpc.io", () => {
    expect(analyticsOn('https://trpc.io', 'preview', 'trpc.io')).toBe(false);
    expect(analyticsOn('https://trpc.io', '', 'trpc.io')).toBe(false);
    expect(
      analyticsOn('https://v12.trpc.io', 'production', 'v12.trpc.io'),
    ).toBe(false);
  });
});

describe('installGtag', () => {
  it("queues Google's snippet as `arguments` objects, with page views left to `pageViews`", () => {
    const target: GtagWindow = {};
    const gtag = installGtag(target, measurementId);
    expect(target.gtag).toBe(gtag);
    const queued = (target.dataLayer ?? []).map((entry) =>
      Array.from(entry as ArrayLike<unknown>),
    );
    expect(queued[0]?.[0]).toBe('js');
    expect(queued[0]?.[1]).toBeInstanceOf(Date);
    expect(queued[1]).toEqual([
      'config',
      'G-7KLX2VFLVR',
      { send_page_view: false },
    ]);
    expect(
      (target.dataLayer ?? []).every(
        (entry) =>
          Object.prototype.toString.call(entry) === '[object Arguments]',
      ),
    ).toBe(true);
  });

  it('keeps what gtag.js or another script already queued', () => {
    const target: GtagWindow = { dataLayer: ['earlier'] };
    installGtag(target, measurementId);
    expect(target.dataLayer?.[0]).toBe('earlier');
    expect(target.dataLayer).toHaveLength(3);
  });
});

describe('pageViews', () => {
  it('sends each page once, with the URL and title it had', () => {
    const sent: Array<Array<unknown>> = [];
    const view = pageViews((...args) => sent.push(args));
    view({ location: 'https://trpc.io/', title: 'tRPC' });
    // Hydration renders the page it loaded on again.
    view({ location: 'https://trpc.io/', title: 'tRPC' });
    view({
      location: 'https://trpc.io/docs/server/routers',
      title: 'Define Routers | tRPC',
    });
    view({
      location: 'https://trpc.io/docs/server/routers#nesting',
      title: 'Define Routers | tRPC',
    });
    expect(sent).toEqual([
      [
        'event',
        'page_view',
        { page_location: 'https://trpc.io/', page_title: 'tRPC' },
      ],
      [
        'event',
        'page_view',
        {
          page_location: 'https://trpc.io/docs/server/routers',
          page_title: 'Define Routers | tRPC',
        },
      ],
      [
        'event',
        'page_view',
        {
          page_location: 'https://trpc.io/docs/server/routers#nesting',
          page_title: 'Define Routers | tRPC',
        },
      ],
    ]);
  });
});
