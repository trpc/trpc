import { notFound } from 'next/navigation'
import { articles, siteUrl } from '../../../content'
async function getArticle(params: Promise<{ slug: string }>) {
  const { slug } = await params
  const article = articles.find((item) => item.slug === slug)
  if (!article) {
    notFound()
  }
  return article
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const article = await getArticle(params)
  return {
    title: article.title,
    description: article.description,
    openGraph: { title: article.title },
    alternates: { canonical: `${siteUrl}/posts/${article.slug}` },
  }
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const article = await getArticle(params)
  return (
    <main>
      <h1>{article.title}</h1>
      <p>{article.body}</p>
    </main>
  )
}
