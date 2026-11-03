import { createFileRoute } from '@tanstack/react-router';

import type * as SponsorCloud from '~/og/sponsor-cloud.ts';

/**
 * A page's social card, `ogImagePath(page)`: `/og/docs/quickstart.png`,
 * and the READMEs' sponsor cloud at `sponsorCloudPath`
 * (`og/sponsor-cloud.ts`). Rendered on request, with what it shows live
 * (`og/live.ts`), and cached by the CDN as long as that says, or as a page
 * (`build/on-demand.ts`).
 * The imports wait for a request, so pages don't load the renderer.
 */
export const Route = createFileRoute('/og/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const cloud = await import('~/og/sponsor-cloud.ts');
        if (url.pathname === cloud.sponsorCloudPath) {
          return sponsorCloudResponse(url, cloud);
        }
        const { cards } = await import('virtual:og-cards');
        const card = cards.get(url.pathname);
        if (card === undefined) {
          return new Response('No social card here', {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            status: 404,
          });
        }
        const [{ renderOgImage }, { cacheControl, fetchLive }] =
          await Promise.all([import('~/og/render.ts'), import('~/og/live.ts')]);
        const live = await fetchLive(card);
        return png(await renderOgImage(card, live), cacheControl(card, live));
      },
    },
  },
});

const png = (body: Uint8Array<ArrayBuffer>, cache: string | undefined) =>
  new Response(body, {
    headers: {
      'Content-Type': 'image/png',
      ...(cache === undefined ? {} : { 'Cache-Control': cache }),
    },
  });

async function sponsorCloudResponse(url: URL, cloud: typeof SponsorCloud) {
  const [{ renderSponsorCloud }, { fetchCloudAvatars }, { drawnSponsors }] =
    await Promise.all([
      import('~/og/render.ts'),
      import('~/og/live.ts'),
      import('~/sponsors.ts'),
    ]);
  const bubbles = cloud.cloudBubbles(drawnSponsors);
  const avatars = await fetchCloudAvatars(
    bubbles.map((bubble) => bubble.image),
  );
  return png(
    await renderSponsorCloud(bubbles, avatars),
    cloud.sponsorCloudCacheControl({
      avatars,
      bubbles,
      current: cloud.sponsorCloudVersion(drawnSponsors),
      requested: url.searchParams.get('v'),
    }),
  );
}
