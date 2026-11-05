import { createFileRoute } from '@tanstack/react-router';

import type * as SponsorCloud from '~/og/sponsor-cloud.ts';

/**
 * A page's social card, `/og/<version>/docs/quickstart.png` for
 * `ogImagePath(page)` at the cards' version (`ogImageUrl`), and the
 * READMEs' sponsor cloud at its own (`sponsorCloudUrl`); the home card's
 * has the UTC day too (`dailyVersion`). Any other URL for
 * one redirects to that first (`og/version.ts`). Rendered on request, with
 * what it shows live (`og/live.ts`), and cached for good, or as briefly as
 * that says.
 * The imports wait for a request, so pages don't load the renderer.
 */
export const Route = createFileRoute('/og/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const [cloud, version, { cards }] = await Promise.all([
          import('~/og/sponsor-cloud.ts'),
          import('~/og/version.ts'),
          import('virtual:og-cards'),
        ]);
        const requested = version.requestedImage(
          url.pathname,
          (path) => path === cloud.sponsorCloudPath || cards.has(path),
        );
        if (requested === undefined) {
          return new Response('No social card here', {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            status: 404,
          });
        }
        const card = cards.get(requested.path);
        const now = new Date();
        const daily = card?.kind === 'home';
        const redirect = version.versionRedirect(
          url,
          requested,
          card === undefined
            ? import.meta.env.SPONSOR_CLOUD_VERSION
            : daily
              ? version.dailyVersion(
                  import.meta.env.OG_CARDS_VERSION,
                  version.utcDay(now),
                )
              : import.meta.env.OG_CARDS_VERSION,
          version.untilVersionChanges(daily, now),
        );
        if (redirect !== undefined) {
          return redirect;
        }
        if (card === undefined) {
          return sponsorCloudResponse(cloud);
        }
        const [{ renderOgImage }, { cacheControl, fetchLive }] =
          await Promise.all([import('~/og/render.ts'), import('~/og/live.ts')]);
        const live = await fetchLive(card);
        return png(await renderOgImage(card, live), cacheControl(card, live));
      },
    },
  },
});

const png = (body: Uint8Array<ArrayBuffer>, cache: string) =>
  new Response(body, {
    headers: { 'Cache-Control': cache, 'Content-Type': 'image/png' },
  });

async function sponsorCloudResponse(cloud: typeof SponsorCloud) {
  const [{ renderSponsorCloud }, { fetchCloudAvatars }, { drawnSponsors }] =
    await Promise.all([
      import('~/og/render.ts'),
      import('~/og/live.ts'),
      import('~/sponsors.ts'),
    ]);
  const layout = cloud.cloudLayout(drawnSponsors);
  const avatars = await fetchCloudAvatars(
    layout.bubbles.map((bubble) => bubble.image),
  );
  return png(
    await renderSponsorCloud(layout, avatars),
    cloud.sponsorCloudCacheControl({ avatars, bubbles: layout.bubbles }),
  );
}
