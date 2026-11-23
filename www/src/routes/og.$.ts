import { createFileRoute } from '@tanstack/react-router';

/**
 * Social cards: `/og` and a page's path (`og/serve.ts`). The import waits
 * for a request, so pages don't load it.
 */
export const Route = createFileRoute('/og/$')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import('~/og/serve.ts')).serveOgImage(request),
    },
  },
});
