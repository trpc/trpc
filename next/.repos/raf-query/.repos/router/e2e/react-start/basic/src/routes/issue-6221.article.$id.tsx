import { Link, createFileRoute } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'

const isAuthed = createClientOnlyFn(
  () => localStorage.getItem('issue-6221-auth') === 'good',
)

const fetchArticle = async (id: string) => {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return isAuthed()
    ? {
        title: `Article Title for ${id}`,
        content: `Article content for ${id}`,
      }
    : null
}

export const Route = createFileRoute('/issue-6221/article/$id')({
  ssr: false,
  loader: ({ params }) => fetchArticle(params.id),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.title ?? 'title n/a' }],
  }),
  component: Article,
})

function Article() {
  const article = Route.useLoaderData()

  return (
    <div>
      <Link to="/issue-6221/dashboard" data-testid="issue-6221-dashboard-link">
        Dashboard
      </Link>
      {article ? (
        <div data-testid="issue-6221-article">{article.content}</div>
      ) : (
        <div>Article Not Accessible.</div>
      )}
    </div>
  )
}
