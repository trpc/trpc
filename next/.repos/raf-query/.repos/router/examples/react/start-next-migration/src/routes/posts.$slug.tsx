import { createFileRoute, notFound } from '@tanstack/react-router'
import { articles, siteUrl } from '../content'
export const Route = createFileRoute('/posts/$slug')({
  loader: ({ params }) => {
    const article = articles.find((item) => item.slug === params.slug)
    if (!article) {
      throw notFound()
    }
    return article
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            { title: loaderData.title },
            { name: 'description', content: loaderData.description },
            { property: 'og:title', content: loaderData.title },
          ],
          links: [
            { rel: 'canonical', href: `${siteUrl}/posts/${loaderData.slug}` },
          ],
        }
      : {},
  component: Article,
})
function Article() {
  const article = Route.useLoaderData()
  return (
    <main>
      <h1>{article.title}</h1>
      <p>{article.body}</p>
    </main>
  )
}
