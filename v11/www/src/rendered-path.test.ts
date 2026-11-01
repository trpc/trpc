import { describe, expect, it } from '@effect/vitest';

import { hydrateRenderedPath, renderedPathRewrite } from './rendered-path.ts';

const origin = 'https://v12.trpc.io';
const input = (href: string) =>
  renderedPathRewrite.input?.({ url: new URL(href, origin) })?.toString();
const output = (href: string) =>
  renderedPathRewrite.output?.({ url: new URL(href, origin) })?.toString();

describe('renderedPathRewrite', () => {
  it('reads the not-found page at a missing path as /404, and only that path', () => {
    hydrateRenderedPath({ renderedPath: '/404' }, '/v12/docs/no-such-page');
    expect(input('/v12/docs/no-such-page?flags=contracts#top')).toBe(
      `${origin}/404?flags=contracts#top`,
    );
    expect(input('/v12/docs/client/links')).toBeUndefined();
    expect(output('/404?flags=contracts')).toBe(
      `${origin}/v12/docs/no-such-page?flags=contracts`,
    );
    expect(output('/')).toBeUndefined();
  });

  it('does nothing on a page at the path it was rendered for', () => {
    hydrateRenderedPath(
      { renderedPath: '/v12/docs/client/links' },
      '/v12/docs/client/links',
    );
    expect(input('/v12/docs/client/links')).toBeUndefined();
    expect(output('/404')).toBeUndefined();
  });
});
