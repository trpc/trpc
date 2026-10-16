import { createFileRoute } from '@tanstack/react-router'
import { articles, siteUrl } from '../content'
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}</loc></url>${articles.map((article) => `<url><loc>${siteUrl}/posts/${article.slug}</loc></url>`).join('')}</urlset>`,
          { headers: { 'Content-Type': 'application/xml' } },
        ),
    },
  },
})
