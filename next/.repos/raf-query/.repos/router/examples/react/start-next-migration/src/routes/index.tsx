import { createFileRoute, Link } from '@tanstack/react-router'
import { articles, siteUrl } from '../content'
export const Route = createFileRoute('/')({
  validateSearch: (search) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  head: () => ({
    meta: [
      { title: 'Field notes' },
      {
        name: 'description',
        content:
          'Notes on moving a web application without losing its public URLs.',
      },
    ],
    links: [{ rel: 'canonical', href: siteUrl }],
  }),
  component: Articles,
})
function Articles() {
  const { q } = Route.useSearch()
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
            <Link to="/posts/$slug" params={{ slug: article.slug }}>
              {article.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
