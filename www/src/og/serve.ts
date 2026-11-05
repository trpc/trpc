/**
 * A page's social card, at the cards' version (`ogImageUrl`), and the
 * sponsor cloud at its own; the home card's has the UTC day too
 * (`dailyVersion`). Any other URL for one redirects to that first
 * (`version.ts`), but the READMEs' sponsor cloud, which is served at a URL
 * that never changes (`sponsorCloudUrl`). Rendered on request, with what
 * it shows live (`live.ts`), and cached for good, or as briefly as that
 * says. The renderer waits for a request for a current URL.
 */
import { cards } from 'virtual:og-cards';

import {
  cloudLayout,
  legacySponsorCloudPath,
  sponsorCloudCacheControl,
  sponsorCloudPage,
  sponsorCloudReadmePath,
} from './sponsor-cloud.ts';
import {
  dailyVersion,
  redirectTo,
  requestedPage,
  untilVersionChanges,
  utcDay,
  versionRedirect,
} from './version.ts';

export async function serveOgImage(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const readme =
    url.pathname === legacySponsorCloudPath ||
    url.pathname === sponsorCloudReadmePath;
  if (readme) {
    return url.pathname === sponsorCloudReadmePath && url.search === ''
      ? sponsorCloudResponse(true)
      : redirectTo(sponsorCloudReadmePath, untilVersionChanges(false, now));
  }
  const page = requestedPage(
    url.pathname,
    (path) => path === sponsorCloudPage || cards.has(path),
  );
  if (page === undefined) {
    return new Response('No social card here', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      status: 404,
    });
  }
  const card = cards.get(page);
  const daily = card?.kind === 'home';
  const redirect = versionRedirect(
    url,
    page,
    card === undefined
      ? import.meta.env.SPONSOR_CLOUD_VERSION
      : daily
        ? dailyVersion(import.meta.env.OG_CARDS_VERSION, utcDay(now))
        : import.meta.env.OG_CARDS_VERSION,
    untilVersionChanges(daily, now),
  );
  if (redirect !== undefined) {
    return redirect;
  }
  if (card === undefined) {
    return sponsorCloudResponse(false);
  }
  const [{ renderOgImage }, { cacheControl, fetchLive }] = await Promise.all([
    import('./render.ts'),
    import('./live.ts'),
  ]);
  const live = await fetchLive(card);
  return png(await renderOgImage(card, live), cacheControl(card, live), null);
}

const png = (
  body: Uint8Array<ArrayBuffer>,
  cache: string,
  etag: string | null,
) =>
  new Response(body, {
    headers: {
      'Cache-Control': cache,
      'Content-Type': 'image/png',
      ...(etag === null ? {} : { ETag: etag }),
    },
  });

/**
 * The cloud, at the READMEs' URL (`readme`) or its version, with its
 * version as its `ETag` there, when it drew every avatar.
 */
async function sponsorCloudResponse(readme: boolean) {
  const [{ renderSponsorCloud }, { fetchCloudAvatars }, { drawnSponsors }] =
    await Promise.all([
      import('./render.ts'),
      import('./live.ts'),
      import('~/sponsors.ts'),
    ]);
  const layout = cloudLayout(drawnSponsors);
  const avatars = await fetchCloudAvatars(
    layout.bubbles.map((bubble) => bubble.image),
  );
  const complete = layout.bubbles.every((bubble) => avatars.has(bubble.image));
  return png(
    await renderSponsorCloud(layout, avatars),
    sponsorCloudCacheControl({ avatars, bubbles: layout.bubbles, readme }),
    readme && complete ? `"${import.meta.env.SPONSOR_CLOUD_VERSION}"` : null,
  );
}
