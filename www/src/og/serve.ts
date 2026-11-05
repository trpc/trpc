/**
 * A page's social card, at the cards' version (`ogImageUrl`), and the
 * sponsor cloud at its own, each with the UTC day (`dailyVersion`). Any
 * other URL for one redirects to that first (`version.ts`), but the
 * READMEs' sponsor cloud, which is served at a URL that never changes
 * (`sponsorCloudUrl`). Rendered on request, with what it shows live
 * (`live.ts`), and cached for good, or as briefly as that says. The
 * renderer waits for a request for a current URL.
 */
import { cards } from 'virtual:og-cards';

import {
  cloudLayout,
  sponsorCloudCacheControl,
  sponsorCloudPage,
  sponsorCloudReadmePath,
} from './sponsor-cloud.ts';
import {
  dailyVersion,
  redirectTo,
  requestedPage,
  untilTomorrow,
  utcDay,
  versionRedirect,
} from './version.ts';

export async function serveOgImage(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const day = utcDay(now);
  if (url.pathname === sponsorCloudReadmePath) {
    return url.search === ''
      ? sponsorCloudResponse(day)
      : redirectTo(sponsorCloudReadmePath, untilTomorrow(now));
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
  const redirect = versionRedirect(
    url,
    page,
    dailyVersion(
      card === undefined
        ? import.meta.env.SPONSOR_CLOUD_VERSION
        : import.meta.env.OG_CARDS_VERSION,
      day,
    ),
    untilTomorrow(now),
  );
  if (redirect !== undefined) {
    return redirect;
  }
  if (card === undefined) {
    return sponsorCloudResponse(null);
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
 * The cloud, at the READMEs' URL on `readmeDay` or at its version
 * (`null`). At the READMEs', when it drew every avatar, its `ETag` is its
 * version on that day, so a cache checking it gets the avatars as they
 * are that day, not when the sponsors last changed.
 */
async function sponsorCloudResponse(readmeDay: string | null) {
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
    sponsorCloudCacheControl({
      avatars,
      bubbles: layout.bubbles,
      readme: readmeDay !== null,
    }),
    readmeDay !== null && complete
      ? `"${dailyVersion(import.meta.env.SPONSOR_CLOUD_VERSION, readmeDay)}"`
      : null,
  );
}
