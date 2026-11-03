import { createFileRoute } from '@tanstack/react-router';

/**
 * A page's social card, `ogImagePath(page)`: `/og/docs/quickstart.png`.
 * Rendered on request, with what it shows live (`og/live.ts`), and cached
 * by the CDN as long as that says, or as a page (`build/on-demand.ts`).
 * The imports wait for a request, so pages don't load the renderer.
 */
export const Route = createFileRoute('/og/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { cards } = await import('virtual:og-cards');
        const card = cards.get(new URL(request.url).pathname);
        if (card === undefined) {
          return new Response('No social card here', {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            status: 404,
          });
        }
        const [{ renderOgImage }, { cacheControl, fetchLive }] =
          await Promise.all([import('~/og/render.ts'), import('~/og/live.ts')]);
        const live = await fetchLive(card);
        const cache = cacheControl(card, live);
        return new Response(await renderOgImage(card, live), {
          headers: {
            'Content-Type': 'image/png',
            ...(cache === undefined ? {} : { 'Cache-Control': cache }),
          },
        });
      },
    },
  },
});
