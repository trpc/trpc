import Link from 'next/link'
import { articles, siteUrl } from '../content'
export const metadata = {
  title: 'Field notes',
  description:
    'Notes on moving a web application without losing its public URLs.',
  alternates: { canonical: siteUrl },
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const search = await searchParams
  const q = typeof search.q === 'string' ? search.q : ''
  const visible = articles.filter((article) =>
    article.title.toLowerCase().includes(q.toLowerCase()),
  )
  return (
    <main>
      <h1>Field notes</h1>
      <form action="/" method="get">
        <label>
          Search articles <input name="q" defaultValue={q} />
        </label>
        <button>Search</button>
      </form>
      <ul>
        {visible.map((article) => (
          <li key={article.slug}>
            <Link href={`/posts/${article.slug}`}>{article.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
