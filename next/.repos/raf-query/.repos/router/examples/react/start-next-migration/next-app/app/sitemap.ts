import { articles, siteUrl } from '../content'
export default function sitemap() {
  return [
    { url: siteUrl },
    ...articles.map((article) => ({ url: `${siteUrl}/posts/${article.slug}` })),
  ]
}
