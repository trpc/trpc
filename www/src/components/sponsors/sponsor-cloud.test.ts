import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { drawnSponsors, sponsorUrl } from '~/sponsors.ts';

import { SponsorCloud } from './sponsor-cloud.tsx';

/** The cloud, prerendered on a page of its own. */
async function prerender(props: Parameters<typeof SponsorCloud>[0]) {
  const router = createRouter({
    history: createMemoryHistory(),
    routeTree: createRootRoute({
      component: () => createElement(SponsorCloud, props),
    }),
  });
  await router.load();
  return renderToString(createElement(RouterProvider, { router }));
}

/** The `<a>` labelled `label` in `html`. */
const linkLabelled = (html: string, label: string) =>
  new RegExp(`<a[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0];

describe('SponsorCloud', () => {
  it('ends with a "You?" bubble, after every sponsor, that links to /sponsor', async () => {
    const html = await prerender({});
    const bubbles = html.match(/data-bubble=""/g) ?? [];
    expect(bubbles).toHaveLength(drawnSponsors.length + 1);
    const you = linkLabelled(html, 'Your bubble here\\? Become a sponsor');
    expect(you).toContain('href="/sponsor"');
    expect(you).not.toContain('target=');
    expect(html.lastIndexOf('<a')).toBe(html.indexOf(you ?? '<none>'));
    expect(html).toContain('>You?</span>');
  });

  it('links the "You?" bubble straight to GitHub Sponsors on /sponsor', async () => {
    const html = await prerender({ you: 'github' });
    const you = linkLabelled(
      html,
      'Your bubble here\\? Sponsor tRPC on GitHub',
    );
    expect(you).toContain(`href="${sponsorUrl}"`);
    expect(you).toContain('target="_blank"');
  });

  it('prerenders the same markup every time, so it hydrates unchanged', async () => {
    expect(await prerender({})).toBe(await prerender({}));
  });
});
