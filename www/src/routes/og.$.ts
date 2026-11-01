import { createFileRoute } from '@tanstack/react-router';

/**
 * A page's social card, `ogImagePath(page)`: `/og/docs/quickstart.png`.
 * Rendered on request, and cached by the CDN until the next deploy
 * (`build/on-demand.ts`). The imports wait for a request, so pages don't
 * load the renderer.
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
        const { renderOgImage } = await import('~/og/render.ts');
        return new Response(await renderOgImage(card), {
          headers: { 'Content-Type': 'image/png' },
        });
      },
    },
  },
});
