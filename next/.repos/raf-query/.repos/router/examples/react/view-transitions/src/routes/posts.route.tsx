import * as React from 'react'
import {
  Link,
  Outlet,
  createFileRoute,
  useRouter,
} from '@tanstack/react-router'
import { fetchPosts } from '../posts'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: PostsLayoutComponent,
})

function PostsLayoutComponent() {
  const posts = Route.useLoaderData()
  const router = useRouter()

  return (
    <div className="p-2 flex gap-2  [view-transition-name:main-content]">
      <ul className="list-disc pl-4">
        {[...posts, { id: 'i-do-not-exist', title: 'Non-existent Post' }].map(
          (post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to="/posts/$postId"
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 text-blue-600 hover:opacity-75"
                  activeProps={{ className: 'font-bold underline' }}
                  // see styles.css for 'warp' and 'warp-backwards' transition
                  viewTransition={{
                    types: ({ fromLocation, toLocation }) => {
                      const fromRoute = router
                        .matchRoutes(fromLocation?.pathname ?? '/')
                        .find((entry) => entry.routeId === '/posts/$postId')
                      const toRoute = router
                        .matchRoutes(toLocation?.pathname ?? '/')
                        .find((entry) => entry.routeId === '/posts/$postId')

                      const fromIndex = Number(fromRoute?.params.postId)
                      const toIndex = Number(toRoute?.params.postId)

                      if (
                        Number.isNaN(fromIndex) ||
                        Number.isNaN(toIndex) ||
                        fromIndex === toIndex
                      ) {
                        return false // no transition
                      }

                      return fromIndex > toIndex ? ['warp-backwards'] : ['warp']
                    },
                  }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            )
          },
        )}
      </ul>
      <hr />
      <div className="[view-transition-name:post]">
        <Outlet />
      </div>
    </div>
  )
}
