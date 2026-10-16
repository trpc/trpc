import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({
  component: PostsComponent,
})

function PostsComponent() {
  return (
    <main>
      <h1>Posts loaded</h1>
      <p>The redirected lazy route rendered.</p>
    </main>
  )
}
